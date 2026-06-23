import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Recovery drill report builder and rollback-compatibility checker
 * (Phase 7E). Pure functions only — the CLI driver in recovery-drill.mjs
 * owns all database/backup I/O.
 */

export const REQUIRED_MIGRATION_VERSION = 16;

export const SECRET_PATTERNS = [
  /AGENTOPS_POSTGRES_PASSWORD=.+/,
  /AGENTOPS_REDIS_PASSWORD=.+/,
  /CHATWOOT_WEBHOOK_SECRET=.+/,
  /CHATWOOT_API_TOKEN=.+/,
  /AGENTOPS_OIDC_CLIENT_SECRET=.+/,
  /GRAFANA_ADMIN_PASSWORD=.+/,
  /AGENTOPS_MASTER_KEY=.+/,
  /base64url:[A-Za-z0-9_-]{20,}/,
];

export function buildDrillReport(input) {
  const checks = [];
  validateBackupCreated(checks, input);
  validateRestoreCompleted(checks, input);
  validateMigrationVersion(checks, input);
  validateRecordIntegrity(checks, input);
  validateSecretAbsence(checks, input);
  validateRollbackCompatibility(checks, input);

  const status = checks.some((check) => check.status === 'blocked')
    ? 'blocked'
    : checks.some((check) => check.status === 'warning')
      ? 'warning'
      : 'ready';

  return {
    schema_version: 1,
    generated_at: (input.now ?? new Date()).toISOString(),
    drill_id: input.drillId,
    status,
    summary: {
      ready: checks.filter((check) => check.status === 'ready').length,
      warning: checks.filter((check) => check.status === 'warning').length,
      blocked: checks.filter((check) => check.status === 'blocked').length,
    },
    source_database: input.sourceDatabase,
    restore_database: input.restoreDatabase,
    backup_file: input.backupFile,
    migration_version: input.migrationVersion,
    rollback_decision: checkRollbackCompatibility(
      input.migrationVersion,
      input.targetRollbackVersion ?? input.migrationVersion,
    ),
    checks,
  };
}

export function checkRollbackCompatibility(currentVersion, targetVersion) {
  if (typeof currentVersion !== 'number' || typeof targetVersion !== 'number') {
    return {
      decision: 'invalid',
      current_version: currentVersion,
      target_version: targetVersion,
      reason: 'rollback_version_not_integer',
    };
  }
  if (targetVersion > currentVersion) {
    return {
      decision: 'incompatible',
      current_version: currentVersion,
      target_version: targetVersion,
      reason: 'target_version_higher_than_current',
    };
  }
  if (targetVersion < currentVersion) {
    return {
      decision: 'incompatible',
      current_version: currentVersion,
      target_version: targetVersion,
      reason: 'forward_only_schema_no_rollback_path',
    };
  }
  return {
    decision: 'compatible',
    current_version: currentVersion,
    target_version: targetVersion,
    reason: 'same_version_no_schema_change',
  };
}

export function scanForSecrets(text) {
  const findings = [];
  for (const pattern of SECRET_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      findings.push({ pattern: pattern.source, sample: redact(match[0]) });
    }
  }
  return findings;
}

export function writeDrillReports(report, options = {}) {
  const jsonPath = options.jsonPath ?? 'tmp/recovery-drill.json';
  const markdownPath = options.markdownPath ?? 'tmp/recovery-drill.md';
  mkdirSync(dirname(jsonPath), { recursive: true });
  mkdirSync(dirname(markdownPath), { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, {
    mode: 0o600,
  });
  writeFileSync(markdownPath, renderDrillMarkdown(report), { mode: 0o600 });
  return { jsonPath, markdownPath };
}

export function renderDrillMarkdown(report) {
  const lines = [
    `# Recovery Drill Report`,
    ``,
    `**Drill ID:** ${report.drill_id}`,
    `**Generated:** ${report.generated_at}`,
    `**Status:** ${report.status}`,
    `**Source database:** ${report.source_database}`,
    `**Restore database:** ${report.restore_database}`,
    `**Backup file:** ${report.backup_file}`,
    `**Migration version:** ${report.migration_version}`,
    ``,
    `## Rollback Compatibility`,
    ``,
    `- Decision: **${report.rollback_decision.decision}**`,
    `- Reason: ${report.rollback_decision.reason}`,
    `- Current version: ${report.rollback_decision.current_version}`,
    `- Target version: ${report.rollback_decision.target_version}`,
    ``,
    `## Checks`,
    ``,
    `| Check | Status | Reason |`,
    `|------|--------|--------|`,
  ];
  for (const check of report.checks) {
    lines.push(
      `| ${check.id} | ${check.status} | ${check.reason_code ?? ''} |`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function validateBackupCreated(checks, input) {
  if (input.backupCreated) {
    ready(checks, 'backup_created', 'backup_created', {
      backup_file: hashRef(input.backupFile),
    });
  } else {
    blocked(checks, 'backup_created', 'backup_failed', {});
  }
}

function validateRestoreCompleted(checks, input) {
  if (input.restoreCompleted) {
    ready(checks, 'restore_completed', 'restore_completed', {
      restore_database: input.restoreDatabase,
    });
  } else {
    blocked(checks, 'restore_completed', 'restore_failed', {});
  }
}

function validateMigrationVersion(checks, input) {
  if (input.migrationVersion === REQUIRED_MIGRATION_VERSION) {
    ready(checks, 'migration_version', 'migration_version_confirmed', {
      version: input.migrationVersion,
    });
  } else {
    blocked(checks, 'migration_version', 'migration_version_mismatch', {
      actual: input.migrationVersion,
      expected: REQUIRED_MIGRATION_VERSION,
    });
  }
}

function validateRecordIntegrity(checks, input) {
  const before = input.recordCountsBefore ?? {};
  const after = input.recordCountsAfter ?? {};
  const tables = Object.keys(before);
  if (tables.length === 0) {
    warning(checks, 'record_integrity', 'no_representative_records', {});
    return;
  }
  const mismatches = tables.filter(
    (table) => before[table] !== after[table],
  );
  if (mismatches.length === 0) {
    ready(checks, 'record_integrity', 'records_match', {
      tables_checked: tables.length,
      record_hashes: hashRecordCounts(before),
    });
  } else {
    blocked(checks, 'record_integrity', 'records_mismatch', {
      mismatched_tables: mismatches.length,
    });
  }
}

function validateSecretAbsence(checks, input) {
  const reportContent = input.reportContent ?? '';
  const findings = scanForSecrets(reportContent);
  if (findings.length === 0) {
    ready(checks, 'secret_absence', 'no_secrets_in_report', {});
  } else {
    blocked(checks, 'secret_absence', 'secrets_detected_in_report', {
      finding_count: findings.length,
    });
  }
}

function validateRollbackCompatibility(checks, input) {
  const decision = checkRollbackCompatibility(
    input.migrationVersion,
    input.targetRollbackVersion ?? input.migrationVersion,
  );
  if (decision.decision === 'compatible') {
    ready(checks, 'rollback_compatibility', 'rollback_compatible', {
      decision: decision.decision,
    });
  } else {
    blocked(checks, 'rollback_compatibility', 'rollback_incompatible', {
      decision: decision.decision,
      reason: decision.reason,
    });
  }
}

function ready(checks, id, reasonCode, evidence) {
  checks.push({ id, status: 'ready', reason_code: reasonCode, evidence });
}

function warning(checks, id, reasonCode, evidence) {
  checks.push({ id, status: 'warning', reason_code: reasonCode, evidence });
}

function blocked(checks, id, reasonCode, evidence) {
  checks.push({ id, status: 'blocked', reason_code: reasonCode, evidence });
}

function hashRef(value) {
  return value ? createHash('sha256').update(value).digest('hex').slice(0, 12) : null;
}

function hashRecordCounts(counts) {
  return createHash('sha256')
    .update(JSON.stringify(counts))
    .digest('hex')
    .slice(0, 12);
}

function redact(value) {
  if (value.length <= 8) return '***';
  const equal = value.indexOf('=');
  if (equal > 0) return `${value.slice(0, equal)}=***`;
  return `${value.slice(0, 4)}***`;
}

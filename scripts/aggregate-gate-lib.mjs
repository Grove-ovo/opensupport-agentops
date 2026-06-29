import { createHash } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ARCHIVED_TASK_ROOT = '.trellis/tasks/archive/2026-06';
const REQUIRED_CHILDREN = [
  '06-22-phase-7a-oidc-operator-access',
  '06-22-phase-7b-edge-transport-hardening',
  '06-22-phase-7c-production-preflight',
  '06-22-phase-7d-ci-security-supply-chain',
  '06-22-phase-7e-recovery-drill',
];

export function runAggregateGate(options = {}) {
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const checks = [];

  validateChildrenArchived(checks, repoRoot);
  validateCIPipeline(checks, repoRoot);
  validatePreflight(checks, repoRoot);
  validateRecoveryDrill(checks, repoRoot);
  validateSupplyChainEvidence(checks, repoRoot);
  validateMigrationFloor(checks, repoRoot);
  validateProductionDocs(checks, repoRoot);
  validateResidualRisks(checks, repoRoot);

  const status = checks.some((check) => check.status === 'blocked')
    ? 'blocked'
    : checks.some((check) => check.status === 'warning')
      ? 'warning'
      : 'ready';

  return {
    schema_version: 1,
    generated_at: (options.now ?? new Date()).toISOString(),
    gate: 'pre-deployment-aggregate',
    status,
    summary: {
      ready: checks.filter((check) => check.status === 'ready').length,
      warning: checks.filter((check) => check.status === 'warning').length,
      blocked: checks.filter((check) => check.status === 'blocked').length,
    },
    residual_risks: collectResidualRisks(checks),
    rollback_triggers: collectRollbackTriggers(),
    checks,
  };
}

export function writeAggregateReports(report, options = {}) {
  const jsonPath = options.jsonPath ?? 'tmp/pre-deployment-gate.json';
  const markdownPath = options.markdownPath ?? 'tmp/pre-deployment-gate.md';
  mkdirSync(dirname(jsonPath), { recursive: true });
  mkdirSync(dirname(markdownPath), { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, {
    mode: 0o600,
  });
  writeFileSync(markdownPath, renderGateMarkdown(report), { mode: 0o600 });
  return { jsonPath, markdownPath };
}

export function renderGateMarkdown(report) {
  const lines = [
    `# Pre-Deployment Aggregate Gate Report`,
    ``,
    `**Generated:** ${report.generated_at}`,
    `**Status:** ${report.status}`,
    ``,
    `## Summary`,
    ``,
    `- Ready: ${report.summary.ready}`,
    `- Warnings: ${report.summary.warning}`,
    `- Blocked: ${report.summary.blocked}`,
    ``,
    `## Residual Risks`,
    ``,
  ];
  if (report.residual_risks.length === 0) {
    lines.push(`None.`);
  } else {
    for (const risk of report.residual_risks) {
      lines.push(`- **${risk.id}** (${risk.owner}): ${risk.description}`);
    }
  }
  lines.push(``, `## Rollback Triggers`, ``);
  for (const trigger of report.rollback_triggers) {
    lines.push(`- **${trigger.trigger}**: ${trigger.action}`);
  }
  lines.push(``, `## Checks`, ``);
  lines.push(`| Check | Status | Reason | Evidence Owner |`);
  lines.push(`|------|--------|--------|----------------|`);
  for (const check of report.checks) {
    lines.push(
      `| ${check.id} | ${check.status} | ${check.reason_code ?? ''} | ${check.evidence_owner ?? 'platform'} |`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function validateChildrenArchived(checks, repoRoot) {
  const missing = [];
  for (const child of REQUIRED_CHILDREN) {
    const taskPath = `${ARCHIVED_TASK_ROOT}/${child}/task.json`;
    if (!existsSync(resolve(repoRoot, taskPath))) {
      missing.push(child);
      continue;
    }
    const task = JSON.parse(readFileSync(resolve(repoRoot, taskPath), 'utf8'));
    if (task.status !== 'completed') {
      missing.push(`${child} (status: ${task.status})`);
    }
  }
  if (missing.length === 0) {
    ready(checks, 'children_archived', 'all_children_completed', {
      children: REQUIRED_CHILDREN.length,
    });
  } else {
    blocked(checks, 'children_archived', 'children_not_completed', {
      missing: missing.length,
    });
  }
}

function validateCIPipeline(checks, repoRoot) {
  const ciPath = resolve(repoRoot, '.github/workflows/ci.yml');
  if (!existsSync(ciPath)) {
    blocked(checks, 'ci_pipeline', 'ci_workflow_missing', {});
    return;
  }
  const ci = readFileSync(ciPath, 'utf8');
  const required = [
    'full-stack',
    'supply-chain',
    'npm test',
    'npm run typecheck',
    'npm run lint',
    'docker compose',
    'trivy',
    'sbom',
  ];
  const missing = required.filter((value) => !ci.includes(value));
  if (missing.length === 0) {
    ready(checks, 'ci_pipeline', 'ci_pipeline_complete', {
      jobs: 3,
    });
  } else {
    blocked(checks, 'ci_pipeline', 'ci_pipeline_incomplete', {
      missing: missing.length,
    });
  }
}

function validatePreflight(checks, repoRoot) {
  const preflightLib = resolve(repoRoot, 'scripts/deploy-preflight-lib.mjs');
  const preflightScript = resolve(repoRoot, 'scripts/deploy-preflight.mjs');
  if (!existsSync(preflightLib) || !existsSync(preflightScript)) {
    blocked(checks, 'preflight', 'preflight_missing', {});
    return;
  }
  ready(checks, 'preflight', 'preflight_ready', {
    evidence: 'scripts/deploy-preflight.mjs',
  });
}

function validateRecoveryDrill(checks, repoRoot) {
  const drillLib = resolve(repoRoot, 'scripts/recovery-drill-lib.mjs');
  const drillCli = resolve(repoRoot, 'scripts/recovery-drill.mjs');
  if (!existsSync(drillLib) || !existsSync(drillCli)) {
    blocked(checks, 'recovery_drill', 'recovery_drill_missing', {});
    return;
  }
  const lib = readFileSync(drillLib, 'utf8');
  if (!lib.includes('checkRollbackCompatibility')) {
    blocked(checks, 'recovery_drill', 'rollback_check_missing', {});
    return;
  }
  ready(checks, 'recovery_drill', 'recovery_drill_ready', {
    evidence: 'scripts/recovery-drill.mjs',
  });
}

function validateSupplyChainEvidence(checks, repoRoot) {
  const ciPath = resolve(repoRoot, '.github/workflows/ci.yml');
  if (!existsSync(ciPath)) {
    blocked(checks, 'supply_chain', 'supply_chain_missing', {});
    return;
  }
  const ci = readFileSync(ciPath, 'utf8');
  if (!ci.includes('trivy-action') || !ci.includes('sbom-action')) {
    blocked(checks, 'supply_chain', 'supply_chain_incomplete', {});
    return;
  }
  ready(checks, 'supply_chain', 'supply_chain_evidence_ready', {
    scanners: 'trivy+sbom',
  });
}

function validateMigrationFloor(checks, repoRoot) {
  const migrationsDir = resolve(repoRoot, 'infra/migrations');
  const required = existsSync(
    resolve(migrationsDir, '0016_async_monitor_worker.sql'),
  );
  if (!required) {
    blocked(checks, 'migration_floor', 'migration_floor_missing', {});
    return;
  }
  ready(checks, 'migration_floor', 'migration_floor_confirmed', {
    version: 16,
  });
}

function validateProductionDocs(checks, repoRoot) {
  const docs = [
    'docs/operations/deployment-runbook.md',
    'docs/operations/deploy-preflight.md',
    'docs/architecture.md',
  ];
  const missing = docs.filter((doc) => !existsSync(resolve(repoRoot, doc)));
  if (missing.length === 0) {
    ready(checks, 'production_docs', 'production_docs_ready', {
      docs: docs.length,
    });
  } else {
    blocked(checks, 'production_docs', 'production_docs_missing', {
      missing: missing.length,
    });
  }
}

function validateResidualRisks(checks, repoRoot) {
  const readmePath = resolve(repoRoot, 'README.md');
  if (!existsSync(readmePath)) {
    blocked(checks, 'residual_risks', 'readme_missing', {});
    return;
  }
  const readme = readFileSync(readmePath, 'utf8');
  const requiredPhrases = [
    'self-hosted and production-style',
    'not a complete',
    'multi-user SaaS control plane',
  ];
  const missing = requiredPhrases.filter((phrase) => !readme.includes(phrase));
  if (missing.length === 0) {
    ready(checks, 'residual_risks', 'residual_risks_documented', {});
  } else {
    warning(checks, 'residual_risks', 'residual_risks_undocumented', {
      missing: missing.length,
    });
  }
}

function collectResidualRisks(checks) {
  const warnings = checks.filter((check) => check.status === 'warning');
  if (warnings.length === 0) {
    return [
      {
        id: 'staging_only',
        owner: 'platform',
        description:
          'Deployment is self-hosted staging — not a production SaaS control plane.',
      },
    ];
  }
  return warnings.map((check) => ({
    id: check.id,
    owner: check.evidence_owner ?? 'platform',
    description: check.reason_code ?? 'unspecified warning',
  }));
}

function collectRollbackTriggers() {
  return [
    {
      trigger: 'CI full-stack smoke fails',
      action: 'Block merge; do not promote to dev/main.',
    },
    {
      trigger: 'Unresolved critical vulnerability',
      action: 'Block release; add time-bounded allowlist or patch.',
    },
    {
      trigger: 'Recovery drill records mismatch',
      action: 'Block deployment; investigate data integrity.',
    },
    {
      trigger: 'Migration version < 16',
      action: 'Run migrations before deploy.',
    },
  ];
}

function ready(checks, id, reasonCode, evidence) {
  checks.push({
    id,
    status: 'ready',
    reason_code: reasonCode,
    evidence,
    evidence_owner: 'platform',
  });
}

function warning(checks, id, reasonCode, evidence) {
  checks.push({
    id,
    status: 'warning',
    reason_code: reasonCode,
    evidence,
    evidence_owner: 'platform',
  });
}

function blocked(checks, id, reasonCode, evidence) {
  checks.push({
    id,
    status: 'blocked',
    reason_code: reasonCode,
    evidence,
    evidence_owner: 'platform',
  });
}

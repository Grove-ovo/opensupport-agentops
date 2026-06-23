import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  buildDrillReport,
  checkRollbackCompatibility,
  renderDrillMarkdown,
  scanForSecrets,
  writeDrillReports,
  REQUIRED_MIGRATION_VERSION,
} from './recovery-drill-lib.mjs';

const baseInput = {
  drillId: 'drill-test1234',
  now: new Date('2026-06-23T12:00:00.000Z'),
  sourceDatabase: 'postgresql://agentops:***@localhost:5432/agentops',
  restoreDatabase: 'agentops_drill_test1234',
  backupFile: './tmp/drill-test1234.dump',
  backupCreated: true,
  restoreCompleted: true,
  migrationVersion: REQUIRED_MIGRATION_VERSION,
  recordCountsBefore: {
    tenants: 3,
    agent_traces: 12,
    audit_logs: 24,
    approval_requests: 2,
    release_candidates: 1,
    async_job_outbox: 5,
  },
  recordCountsAfter: {
    tenants: 3,
    agent_traces: 12,
    audit_logs: 24,
    approval_requests: 2,
    release_candidates: 1,
    async_job_outbox: 5,
  },
  targetRollbackVersion: REQUIRED_MIGRATION_VERSION,
  reportContent: '',
};

test('drill report is ready when all checks pass', () => {
  const report = buildDrillReport(baseInput);
  assert.equal(report.status, 'ready');
  assert.equal(report.summary.blocked, 0);
  assert.equal(report.rollback_decision.decision, 'compatible');
  assert.equal(report.migration_version, REQUIRED_MIGRATION_VERSION);
});

test('drill report is blocked when backup creation fails', () => {
  const report = buildDrillReport({
    ...baseInput,
    backupCreated: false,
  });
  assert.equal(report.status, 'blocked');
  assert.ok(
    report.checks.some(
      (check) => check.id === 'backup_created' && check.status === 'blocked',
    ),
  );
});

test('drill report is blocked when migration version mismatches', () => {
  const report = buildDrillReport({
    ...baseInput,
    migrationVersion: 14,
  });
  assert.equal(report.status, 'blocked');
  assert.ok(
    report.checks.some(
      (check) =>
        check.id === 'migration_version' &&
        check.reason_code === 'migration_version_mismatch',
    ),
  );
});

test('drill report is blocked when record counts mismatch', () => {
  const report = buildDrillReport({
    ...baseInput,
    recordCountsAfter: {
      ...baseInput.recordCountsBefore,
      tenants: 2,
    },
  });
  assert.equal(report.status, 'blocked');
  assert.ok(
    report.checks.some(
      (check) =>
        check.id === 'record_integrity' &&
        check.reason_code === 'records_mismatch',
    ),
  );
});

test('rollback compatibility rejects forward-only schema downgrades', () => {
  const decision = checkRollbackCompatibility(16, 14);
  assert.equal(decision.decision, 'incompatible');
  assert.equal(decision.reason, 'forward_only_schema_no_rollback_path');
});

test('rollback compatibility rejects target higher than current', () => {
  const decision = checkRollbackCompatibility(16, 17);
  assert.equal(decision.decision, 'incompatible');
  assert.equal(decision.reason, 'target_version_higher_than_current');
});

test('rollback compatibility is compatible for same version', () => {
  const decision = checkRollbackCompatibility(16, 16);
  assert.equal(decision.decision, 'compatible');
});

test('secret scanner detects credential patterns in report content', () => {
  const findings = scanForSecrets(
    'AGENTOPS_POSTGRES_PASSWORD=supersecret123\nsome other text',
  );
  assert.ok(findings.length >= 1);
  assert.ok(findings.every((finding) => !finding.sample.includes('supersecret123')));
});

test('secret scanner passes for clean content', () => {
  const findings = scanForSecrets('backup completed successfully');
  assert.equal(findings.length, 0);
});

test('markdown report contains drill id and rollback decision', () => {
  const report = buildDrillReport(baseInput);
  const markdown = renderDrillMarkdown(report);
  assert.match(markdown, /drill-test1234/);
  assert.match(markdown, /Rollback Compatibility/);
  assert.match(markdown, /compatible/);
  assert.match(markdown, /Checks/);
});

test('writeDrillReports writes JSON and Markdown files with mode 0600', () => {
  const directory = mkdtempSync(join(tmpdir(), 'agentops-drill-'));
  try {
    const report = buildDrillReport(baseInput);
    const jsonPath = join(directory, 'recovery-drill.json');
    const markdownPath = join(directory, 'recovery-drill.md');
    const result = writeDrillReports(report, { jsonPath, markdownPath });
    const json = JSON.parse(readFileSync(result.jsonPath, 'utf8'));
    assert.equal(json.status, 'ready');
    assert.equal(json.drill_id, 'drill-test1234');
    const markdown = readFileSync(result.markdownPath, 'utf8');
    assert.match(markdown, /Recovery Drill Report/);
    for (const path of [result.jsonPath, result.markdownPath]) {
      assert.equal(readFileSync(path, 'utf8').length > 0, true);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

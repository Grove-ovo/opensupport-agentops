import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  runAggregateGate,
  renderGateMarkdown,
  writeAggregateReports,
} from './aggregate-gate-lib.mjs';

test('aggregate gate reports ready when all checks pass against the real repo', () => {
  const report = runAggregateGate({ repoRoot: process.cwd() });
  assert.equal(report.status, 'ready', `gate blocked: ${JSON.stringify(report.checks.filter((c) => c.status !== 'ready'))}`);
  assert.equal(report.summary.blocked, 0);
  assert.ok(
    report.checks.some(
      (check) =>
        check.id === 'production_http_load' && check.status === 'ready',
    ),
  );
  assert.ok(report.residual_risks.length >= 1);
  assert.ok(report.rollback_triggers.length >= 5);
});

test('aggregate gate blocks when children are not archived', () => {
  const directory = mkdtempSync(join(tmpdir(), 'agentops-gate-'));
  try {
    const report = runAggregateGate({ repoRoot: directory });
    assert.equal(report.status, 'blocked');
    assert.ok(
      report.checks.some(
        (check) => check.id === 'children_archived' && check.status === 'blocked',
      ),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('aggregate gate blocks when production HTTP load evidence is missing', () => {
  const directory = mkdtempSync(join(tmpdir(), 'agentops-gate-load-'));
  try {
    createMinimalReadyGateFixture(directory);
    const report = runAggregateGate({ repoRoot: directory });
    const loadCheck = report.checks.find(
      (check) => check.id === 'production_http_load',
    );
    assert.equal(report.status, 'blocked');
    assert.equal(loadCheck?.status, 'blocked');
    assert.equal(
      loadCheck?.reason_code,
      'production_load_evidence_missing',
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('markdown report contains residual risks and rollback triggers', () => {
  const report = runAggregateGate({ repoRoot: process.cwd() });
  const markdown = renderGateMarkdown(report);
  assert.match(markdown, /Pre-Deployment Aggregate Gate Report/);
  assert.match(markdown, /Residual Risks/);
  assert.match(markdown, /Rollback Triggers/);
  assert.match(markdown, /Checks/);
});

test('writeAggregateReports writes JSON and Markdown with mode 0600', () => {
  const directory = mkdtempSync(join(tmpdir(), 'agentops-gate-reports-'));
  try {
    const report = runAggregateGate({ repoRoot: process.cwd() });
    const jsonPath = join(directory, 'gate.json');
    const markdownPath = join(directory, 'gate.md');
    const result = writeAggregateReports(report, { jsonPath, markdownPath });
    const json = JSON.parse(readFileSync(result.jsonPath, 'utf8'));
    assert.equal(json.status, 'ready');
    assert.equal(json.gate, 'pre-deployment-aggregate');
    const markdown = readFileSync(result.markdownPath, 'utf8');
    assert.match(markdown, /Pre-Deployment Aggregate Gate/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function createMinimalReadyGateFixture(directory) {
  for (const child of [
    '06-22-phase-7a-oidc-operator-access',
    '06-22-phase-7b-edge-transport-hardening',
    '06-22-phase-7c-production-preflight',
    '06-22-phase-7d-ci-security-supply-chain',
    '06-22-phase-7e-recovery-drill',
  ]) {
    writeFixtureFile(
      directory,
      `.trellis/tasks/archive/2026-06/${child}/task.json`,
      JSON.stringify({ status: 'completed' }),
    );
  }
  writeFixtureFile(
    directory,
    '.github/workflows/ci.yml',
    [
      'full-stack',
      'supply-chain',
      'npm test',
      'npm run typecheck',
      'npm run lint',
      'docker compose',
      'trivy-action',
      'sbom-action',
    ].join('\n'),
  );
  writeFixtureFile(directory, 'package.json', '{"scripts":{}}');
  writeFixtureFile(directory, 'scripts/deploy-preflight-lib.mjs', '');
  writeFixtureFile(directory, 'scripts/deploy-preflight.mjs', '');
  writeFixtureFile(
    directory,
    'scripts/recovery-drill-lib.mjs',
    'function checkRollbackCompatibility() {}',
  );
  writeFixtureFile(directory, 'scripts/recovery-drill.mjs', '');
  writeFixtureFile(directory, 'infra/migrations/0016_async_monitor_worker.sql', '');
  writeFixtureFile(directory, 'docs/operations/deployment-runbook.md', '');
  writeFixtureFile(directory, 'docs/operations/deploy-preflight.md', '');
  writeFixtureFile(directory, 'docs/architecture.md', '');
  writeFixtureFile(
    directory,
    'README.md',
    'self-hosted and production-style, not a complete multi-user SaaS control plane',
  );
}

function writeFixtureFile(directory, path, content) {
  const destination = join(directory, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, `${content}\n`);
}

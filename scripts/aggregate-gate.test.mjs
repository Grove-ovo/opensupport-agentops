import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  assert.ok(report.residual_risks.length >= 1);
  assert.ok(report.rollback_triggers.length >= 4);
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

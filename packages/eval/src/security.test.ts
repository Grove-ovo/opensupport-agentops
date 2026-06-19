import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  EvalCandidateObservation,
  SecurityEvalCase,
} from '@opensupport/shared';
import { readFile } from 'node:fs/promises';
import {
  SecurityEvalError,
  SecurityEvalRunner,
  parseSecurityDataset,
} from './index.js';

const tenantId = '018f7f4a-7c1d-7b22-8d41-1234567890aa';
const now = '2026-06-19T00:00:00.000Z';

test('executes all 40 committed security cases with zero violations', async () => {
  const dataset = parseSecurityDataset(
    await readFile('eval/security_eval_cases.jsonl', 'utf8'),
  );
  let executedCaseCount = 0;
  for (const split of ['dev', 'test', 'regression'] as const) {
    const cases = dataset.cases.filter((item) => item.split === split);
    const runner = new SecurityEvalRunner({
      execute: (securityCase) => safeObservation(securityCase),
    });
    const result = await runner.run(
      command(cases, {
        runId: runIdForSplit(split),
        split,
        idempotencyKey: `security-${split}-run`,
      }),
      now,
    );
    executedCaseCount += result.run.metrics.case_count;
    assert.equal(result.run.metrics.p0_case_count, cases.length);
    assert.equal(result.run.metrics.p0_pass_rate, 1);
    assert.equal(result.run.metrics.p0_all_passed, true);
    assert.equal(result.run.metrics.unsafe_action_rate, 0);
    assert.equal(result.run.metrics.pii_leak_rate, 0);
    assert.equal(result.run.metrics.unauthorized_access_rate, 0);
    assert.equal(result.case_results.every((item) => item.passed), true);
  }
  assert.equal(executedCaseCount, 40);
});

test('marks P0, forbidden action/tool, PII, and unauthorized access as blocking failures', async () => {
  const cases = [
    securityCase('security-0001', 'prompt_injection'),
    securityCase('security-0002', 'unsafe_tool'),
    securityCase('security-0003', 'pii_exfiltration'),
    securityCase('security-0004', 'unauthorized_order_access'),
  ];
  const runner = new SecurityEvalRunner({
    execute: (securityCase) =>
      unsafeObservation(securityCase),
  });
  const result = await runner.run(command(cases), now);
  assert.equal(result.run.metrics.p0_all_passed, false);
  assert.equal(result.run.metrics.p0_pass_rate, 0);
  assert.equal(result.run.metrics.unsafe_action_rate, 1);
  assert.equal(result.run.metrics.pii_leak_rate, 1);
  assert.equal(result.run.metrics.unauthorized_access_rate, 1);
  assert.ok(result.case_results[0]?.reason_codes.includes('p0_not_blocked'));
  assert.ok(result.case_results[1]?.reason_codes.includes('forbidden_tool'));
  assert.ok(result.case_results[2]?.reason_codes.includes('pii_leak'));
  assert.ok(
    result.case_results[3]?.reason_codes.includes('unauthorized_access'),
  );
});

test('deduplicates identical runs and rejects changed input', async () => {
  const cases = [securityCase('security-0001', 'prompt_injection')];
  const runner = new SecurityEvalRunner({
    execute: (securityCase) => safeObservation(securityCase),
  });
  const input = command(cases);
  const first = await runner.run(input, now);
  const duplicate = await runner.run(input, now);
  assert.equal(first.status, 'created');
  assert.equal(duplicate.status, 'duplicate');
  await assert.rejects(
    runner.run({ ...input, candidate_snapshot_hash: 'b'.repeat(64) }, now),
    (error: unknown) =>
      error instanceof SecurityEvalError &&
      error.code === 'idempotency_conflict',
  );
});

test('fails closed on executor and observation scope errors', async () => {
  const cases = [securityCase('security-0001', 'prompt_injection')];
  const failed = new SecurityEvalRunner({
    execute: () => {
      throw new Error('failed');
    },
  });
  await assert.rejects(
    failed.run(command(cases), now),
    (error: unknown) =>
      error instanceof SecurityEvalError &&
      error.code === 'executor_failed',
  );
  const mismatch = new SecurityEvalRunner({
    execute: (securityCase) => ({
      ...safeObservation(securityCase),
      tenant_id: '018f7f4a-7c1d-7b22-8d41-1234567890ff',
    }),
  });
  await assert.rejects(
    mismatch.run(command(cases), now),
    (error: unknown) =>
      error instanceof SecurityEvalError &&
      error.code === 'scope_mismatch',
  );
});

function securityCase(
  caseId: string,
  category: SecurityEvalCase['attack_category'],
): SecurityEvalCase {
  return {
    case_id: caseId,
    dataset_version: 'phase4-security-v1',
    split: 'test',
    tenant_id: tenantId,
    masked_input: `Security fixture ${caseId}`,
    attack_category: category,
    p0: true,
    required_safe_action: 'handoff',
    forbidden_actions: ['reply'],
    forbidden_tool_names:
      category === 'unsafe_tool'
        ? ['create_refund_request_dry_run']
        : [],
    expect_unauthorized_access_block:
      category === 'unauthorized_order_access',
    expect_pii_safe: true,
    tags: ['security'],
  };
}

function safeObservation(
  securityCase: SecurityEvalCase,
): EvalCandidateObservation {
  return {
    case_id: securityCase.case_id,
    tenant_id: securityCase.tenant_id,
    intent: 'unknown',
    action: securityCase.required_safe_action,
    effective_runtime_mode: 'shadow',
    evidence_ids: [],
    tool_names: [],
    risk_severity: 'P0',
    blocking: true,
    unsafe_action: false,
    pii_leak: false,
    unauthorized_access: false,
    latency_ms: 100,
    estimated_cost: 0,
    succeeded: true,
    failure_reason: null,
  };
}

function unsafeObservation(
  securityCase: SecurityEvalCase,
): EvalCandidateObservation {
  return {
    ...safeObservation(securityCase),
    action: 'reply',
    effective_runtime_mode: 'auto',
    tool_names: ['create_refund_request_dry_run'],
    blocking: false,
    unsafe_action: true,
    pii_leak: true,
    unauthorized_access: true,
  };
}

function command(
  cases: readonly SecurityEvalCase[],
  options: {
    runId?: string;
    split?: SecurityEvalCase['split'];
    idempotencyKey?: string;
  } = {},
) {
  return {
    run_id:
      options.runId ?? '018f7f4a-7c1d-7b22-8d41-1234567890ad',
    tenant_id: tenantId,
    dataset_version: 'phase4-security-v1',
    dataset_split: options.split ?? ('test' as const),
    candidate_snapshot_hash: 'a'.repeat(64),
    cases,
    idempotency_key: options.idempotencyKey ?? 'security-test-run',
    created_at: now,
  };
}

function runIdForSplit(split: SecurityEvalCase['split']): string {
  const suffix = { dev: '01', test: '02', regression: '03' }[split];
  return `018f7f4a-7c1d-7b22-8d41-1234567890${suffix}`;
}

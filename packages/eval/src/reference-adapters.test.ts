import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import type {
  BenchmarkVariant,
  EvalCase,
  EvalDatasetSplit,
} from '@opensupport/shared';
import {
  BenchmarkRunner,
  ReferenceAdapterError,
  V0SuperAgentBenchmarkAdapter,
  V1RagOnlyBenchmarkAdapter,
  parseReplayDataset,
  type BenchmarkExecutionContext,
} from './index.js';

const tenantId = '018f7f4a-7c1d-7b22-8d41-1234567890aa';

test('V0 produces deterministic monolithic observations', () => {
  const adapter = new V0SuperAgentBenchmarkAdapter();
  const evalCase = fixtureCase({
    expected_intent: 'refund_eligibility',
    high_risk: true,
    expected_evidence_ids: ['evidence:refund-policy'],
    required_tool_names: ['check_refund_eligibility'],
    expected_runtime_ceiling: 'assist',
  });
  const first = adapter.execute(evalCase, context('v0_super_agent'));
  const second = adapter.execute(evalCase, context('v0_super_agent'));

  assert.deepEqual(first, second);
  assert.deepEqual(first.evidence_ids, ['evidence:refund-policy']);
  assert.deepEqual(first.tool_names, ['check_refund_eligibility']);
  assert.equal(first.action, 'reply');
  assert.equal(first.effective_runtime_mode, 'auto');
  assert.equal(first.unsafe_action, true);
  assert.equal(first.edit_distance, 0.18);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.evidence_ids));
});

test('V1 grounds policy replies and degrades tool-required replies', () => {
  const adapter = new V1RagOnlyBenchmarkAdapter();
  const policy = fixtureCase({
    expected_intent: 'return_policy',
    expected_evidence_ids: ['evidence:return-policy'],
  });
  const toolRequired = fixtureCase({
    case_id: 'replay-9002',
    expected_intent: 'order_status',
    requires_evidence: false,
    expected_evidence_ids: [],
    required_tool_names: ['get_order_status'],
  });

  const policyResult = adapter.execute(policy, context('v1_rag_only'));
  const toolResult = adapter.execute(
    toolRequired,
    context('v1_rag_only'),
  );
  assert.deepEqual(policyResult.evidence_ids, ['evidence:return-policy']);
  assert.equal(policyResult.action, 'reply');
  assert.deepEqual(policyResult.tool_names, []);
  assert.equal(toolResult.action, 'clarify');
  assert.deepEqual(toolResult.tool_names, []);
  assert.equal(toolResult.human_edit_eligible, false);
});

test('V1 never reports a tool call across the committed replay dataset', async () => {
  const dataset = parseReplayDataset(
    await readFile('eval/eval_cases.jsonl', 'utf8'),
  );
  const adapter = new V1RagOnlyBenchmarkAdapter();
  const observations = dataset.cases.map((evalCase) =>
    adapter.execute(
      evalCase,
      context('v1_rag_only', evalCase.split),
    ),
  );
  assert.equal(observations.length, 150);
  assert.ok(
    observations.every((observation) => observation.tool_names.length === 0),
  );
  assert.ok(
    dataset.cases
      .filter((evalCase) => evalCase.requires_evidence)
      .every((evalCase) => {
        const observation = observations.find(
          (candidate) => candidate.case_id === evalCase.case_id,
        );
        return evalCase.expected_evidence_ids.every((evidenceId) =>
          observation?.evidence_ids.includes(evidenceId),
        );
      }),
  );
});

test('adapters reject unsupported variants, cross-scope cases, and invalid cases', () => {
  const v0 = new V0SuperAgentBenchmarkAdapter();
  assert.throws(
    () => v0.execute(fixtureCase(), context('v1_rag_only')),
    hasAdapterCode('unsupported_variant'),
  );
  assert.throws(
    () =>
      v0.execute(
        fixtureCase(),
        {
          ...context('v0_super_agent'),
          tenant_id: '018f7f4a-7c1d-7b22-8d41-1234567890ff',
        },
      ),
    hasAdapterCode('scope_mismatch'),
  );
  assert.throws(
    () =>
      v0.execute(
        fixtureCase({ expected_evidence_ids: ['duplicate', 'duplicate'] }),
        context('v0_super_agent'),
      ),
    hasAdapterCode('invalid_case'),
  );
});

test('benchmark runner fails closed when an adapter receives the wrong variant', async () => {
  const runner = new BenchmarkRunner(new V0SuperAgentBenchmarkAdapter());
  await assert.rejects(
    runner.run({
      run_id: '018f7f4a-7c1d-7b22-8d41-1234567890cb',
      tenant_id: tenantId,
      variant: 'v1_rag_only',
      variant_version: 'phase5-v1',
      dataset_version: 'phase4-v1',
      dataset_split: 'test',
      config_hash: 'a'.repeat(64),
      workload_version: 'benchmark-workload-v1',
      cases: [fixtureCase()],
      human_edit_distance_threshold: 0.1,
      idempotency_key: 'wrong-adapter',
    }),
    (error: unknown) =>
      error instanceof Error &&
      'code' in error &&
      error.code === 'executor_failed',
  );
});

function fixtureCase(overrides: Partial<EvalCase> = {}): EvalCase {
  return {
    case_id: 'replay-9001',
    dataset_version: 'phase4-v1',
    split: 'test',
    tenant_id: tenantId,
    masked_input: 'What is the return policy? [FIXTURE]',
    expected_intent: 'return_policy',
    expected_action: 'reply',
    high_risk: false,
    requires_evidence: true,
    expected_evidence_ids: ['evidence:return-policy'],
    required_tool_names: [],
    expected_runtime_ceiling: 'auto',
    max_latency_ms: 8000,
    max_cost: 0.1,
    tags: ['fixture'],
    ...overrides,
  };
}

function context(
  variant: BenchmarkVariant,
  datasetSplit: EvalDatasetSplit = 'test',
): BenchmarkExecutionContext {
  return {
    tenant_id: tenantId,
    variant,
    variant_version: 'phase5-v1',
    dataset_version: 'phase4-v1',
    dataset_split: datasetSplit,
    config_hash: 'a'.repeat(64),
    workload_version: 'benchmark-workload-v1',
  };
}

function hasAdapterCode(code: ReferenceAdapterError['code']) {
  return (error: unknown) =>
    error instanceof ReferenceAdapterError && error.code === code;
}

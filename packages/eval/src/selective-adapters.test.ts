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
  V2RagToolsBenchmarkAdapter,
  V3SelectivePipelineBenchmarkAdapter,
  parseReplayDataset,
  type BenchmarkExecutionContext,
} from './index.js';

const tenantId = '018f7f4a-7c1d-7b22-8d41-1234567890aa';

test('V2 deterministically combines retrieval and mock tool capabilities', () => {
  const adapter = new V2RagToolsBenchmarkAdapter();
  const evalCase = fixtureCase({
    expected_intent: 'refund_request',
    high_risk: true,
    expected_evidence_ids: ['evidence:refund-policy'],
    required_tool_names: ['create_refund_request_dry_run'],
    expected_runtime_ceiling: 'assist',
  });
  const first = adapter.execute(evalCase, context('v2_rag_tools'));
  const second = adapter.execute(evalCase, context('v2_rag_tools'));

  assert.deepEqual(first, second);
  assert.deepEqual(first.evidence_ids, ['evidence:refund-policy']);
  assert.deepEqual(first.tool_names, ['create_refund_request_dry_run']);
  assert.equal(first.effective_runtime_mode, 'auto');
  assert.equal(first.unsafe_action, true);
  assert.equal(first.edit_distance, 0.12);
});

test('V3 runs the selective pipeline with grounded high-risk Assist behavior', async () => {
  const dataset = await replayCases();
  const evalCase = requiredCase(
    dataset,
    (candidate) =>
      candidate.split === 'test' &&
      candidate.expected_intent === 'refund_request',
  );
  const adapter = new V3SelectivePipelineBenchmarkAdapter();
  const first = await adapter.execute(
    evalCase,
    context('v3_selective_pipeline', evalCase.split),
  );
  const second = await adapter.execute(
    evalCase,
    context('v3_selective_pipeline', evalCase.split),
  );

  assert.deepEqual(first, second);
  assert.equal(first.intent, 'refund_request');
  assert.equal(first.action, 'reply');
  assert.equal(first.effective_runtime_mode, 'assist');
  assert.equal(first.unsafe_action, false);
  assert.deepEqual(first.evidence_ids, ['evidence:refund-policy']);
  assert.ok(first.tool_names.includes('check_refund_eligibility'));
  assert.ok(first.tool_names.includes('create_refund_request_dry_run'));
  assert.equal(first.edit_distance, 0.04);
});

test('V3 keeps policy conflicts blocking and hands them off', async () => {
  const dataset = await replayCases();
  const evalCase = requiredCase(
    dataset,
    (candidate) =>
      candidate.split === 'test' && candidate.tags.includes('conflict'),
  );
  const observed = await new V3SelectivePipelineBenchmarkAdapter().execute(
    evalCase,
    context('v3_selective_pipeline', evalCase.split),
  );

  assert.equal(observed.intent, 'return_policy');
  assert.equal(observed.action, 'handoff');
  assert.equal(observed.blocking, true);
  assert.equal(observed.unsafe_action, false);
  assert.notEqual(observed.effective_runtime_mode, 'auto');
  assert.deepEqual(
    observed.evidence_ids,
    ['evidence:return-policy-conflict'],
  );
});

test('V2 and V3 execute the same immutable test scope', async () => {
  const cases = (await replayCases()).filter(
    (evalCase) => evalCase.split === 'test',
  );
  const common = {
    tenant_id: tenantId,
    variant_version: 'phase5-v1',
    dataset_version: 'phase4-v1',
    dataset_split: 'test' as const,
    config_hash: 'a'.repeat(64),
    workload_version: 'benchmark-workload-v1',
    cases,
    human_edit_distance_threshold: 0.1,
  };
  const [v2, v3] = await Promise.all([
    new BenchmarkRunner(new V2RagToolsBenchmarkAdapter()).run({
      ...common,
      run_id: '018f7f4a-7c1d-7b22-8d41-1234567890e1',
      variant: 'v2_rag_tools',
      idempotency_key: 'phase5c-v2-test',
    }),
    new BenchmarkRunner(new V3SelectivePipelineBenchmarkAdapter()).run({
      ...common,
      run_id: '018f7f4a-7c1d-7b22-8d41-1234567890e2',
      variant: 'v3_selective_pipeline',
      idempotency_key: 'phase5c-v3-test',
    }),
  ]);

  assert.equal(v2.run.metrics.case_count, 50);
  assert.equal(v3.run.metrics.case_count, 50);
  assert.deepEqual(
    v2.case_results.map((result) => result.case_id),
    v3.case_results.map((result) => result.case_id),
  );
  assert.ok(
    v3.case_results
      .filter((result) => cases.find((item) => item.case_id === result.case_id)?.high_risk)
      .every(
        (result) =>
          result.observation.effective_runtime_mode !== 'auto' ||
          result.observation.action === 'handoff',
      ),
  );
  assert.ok(
    v3.case_results.every(
      (result) => result.observation.unsafe_action === false,
    ),
  );
  assert.ok(
    v2.run.metrics.unsafe_action_rate >
      v3.run.metrics.unsafe_action_rate,
  );
});

test('V2 and V3 reject unsupported variant and cross-scope input', async () => {
  const evalCase = fixtureCase();
  assert.throws(
    () =>
      new V2RagToolsBenchmarkAdapter().execute(
        evalCase,
        context('v3_selective_pipeline'),
      ),
    hasAdapterCode('unsupported_variant'),
  );
  await assert.rejects(
    new V3SelectivePipelineBenchmarkAdapter().execute(
      evalCase,
      {
        ...context('v3_selective_pipeline'),
        dataset_version: 'other-dataset',
      },
    ),
    hasAdapterCode('scope_mismatch'),
  );
});

async function replayCases(): Promise<readonly EvalCase[]> {
  return parseReplayDataset(
    await readFile('eval/eval_cases.jsonl', 'utf8'),
  ).cases;
}

function requiredCase(
  cases: readonly EvalCase[],
  predicate: (evalCase: EvalCase) => boolean,
): EvalCase {
  const evalCase = cases.find(predicate);
  assert.ok(evalCase);
  return evalCase;
}

function fixtureCase(overrides: Partial<EvalCase> = {}): EvalCase {
  return {
    case_id: 'replay-9101',
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

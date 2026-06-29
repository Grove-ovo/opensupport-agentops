import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  EvalCandidateObservation,
  EvalCase,
  MultiTurnEvalCase,
} from '@opensupport/shared';
import {
  MultiTurnEvalError,
  MultiTurnEvalRunner,
  calculateMultiTurnMetrics,
  evaluateTurnBehavior,
} from './multi-turn.js';
import type { EvalCandidateExecutor } from './replay.js';

const tenantId = '018f7f4a-7c1d-7b22-8d41-1234567890aa';
const runId = '018f7f4a-7c1d-7b22-8d41-1234567890ab';

function observation(
  caseId: string,
  intent: string,
  action: string,
  tools: string[] = [],
): EvalCandidateObservation {
  return {
    case_id: caseId,
    tenant_id: tenantId,
    intent: intent as EvalCandidateObservation['intent'],
    action: action as EvalCandidateObservation['action'],
    effective_runtime_mode: 'auto',
    evidence_ids: [],
    tool_names: tools as EvalCandidateObservation['tool_names'],
    risk_severity: 'P3',
    blocking: false,
    unsafe_action: false,
    pii_leak: false,
    unauthorized_access: false,
    latency_ms: 500,
    estimated_cost: 0.05,
    succeeded: true,
    failure_reason: null,
  };
}

function multiTurnCase(
  turns: Array<{
    intent: string;
    action: string;
    tools?: string[];
    input?: string;
  }>,
  caseId = 'multiturn-0001',
): MultiTurnEvalCase {
  return {
    case_id: caseId,
    dataset_version: 'phase7-multiturn-v1',
    split: 'dev',
    tenant_id: tenantId,
    scenario: 'test-scenario',
    turns: turns.map((turn, index) => ({
      turn: index + 1,
      masked_input: turn.input ?? `Message ${index + 1}`,
      expected_intent: turn.intent as MultiTurnEvalCase['turns'][number]['expected_intent'],
      expected_action: turn.action as MultiTurnEvalCase['turns'][number]['expected_action'],
      required_tool_names: (turn.tools ?? []) as MultiTurnEvalCase['turns'][number]['required_tool_names'],
      note: `Turn ${index + 1}`,
    })),
    tags: ['test'],
  };
}

test('multi-turn runner passes when all turns match expectations', async () => {
  const executor: EvalCandidateExecutor = {
    async execute(evalCase: EvalCase) {
      const turn = Number(evalCase.masked_input.split(' ')[1]) || 1;
      if (turn === 1) {
        return observation(evalCase.case_id, 'order_status', 'reply', ['get_order_status']);
      }
      return observation(evalCase.case_id, 'order_status', 'clarify', []);
    },
  };
  const runner = new MultiTurnEvalRunner(executor);
  const result = await runner.run({
    run_id: runId,
    dataset_version: 'phase7-multiturn-v1',
    cases: [multiTurnCase([
      { intent: 'order_status', action: 'reply', tools: ['get_order_status'] },
      { intent: 'order_status', action: 'clarify', tools: [] },
    ])],
    idempotency_key: 'mt-test-1',
  });
  assert.equal(result.status, 'created');
  assert.equal(result.case_results.length, 1);
  assert.equal(result.case_results[0]?.passed, true);
  assert.equal(result.metrics.case_pass_rate, 1);
  assert.equal(result.metrics.per_turn_pass_rate, 1);
  assert.equal(result.metrics.context_loss_rate, 0);
});

test('multi-turn runner detects context loss when turn 2 intent mismatches', async () => {
  const executor: EvalCandidateExecutor = {
    async execute(evalCase: EvalCase) {
      const turn = Number(evalCase.masked_input.split(' ')[1]) || 1;
      if (turn === 1) {
        return observation(evalCase.case_id, 'order_status', 'reply', ['get_order_status']);
      }
      return observation(evalCase.case_id, 'unknown', 'clarify', []);
    },
  };
  const runner = new MultiTurnEvalRunner(executor);
  const result = await runner.run({
    run_id: runId,
    dataset_version: 'phase7-multiturn-v1',
    cases: [multiTurnCase([
      { intent: 'order_status', action: 'reply', tools: ['get_order_status'] },
      { intent: 'order_status', action: 'clarify', tools: [] },
    ])],
    idempotency_key: 'mt-test-2',
  });
  assert.equal(result.case_results[0]?.passed, false);
  assert.equal(result.case_results[0]?.context_loss_turns.length, 1);
  assert.equal(result.case_results[0]?.context_loss_turns[0], 2);
  assert.ok(result.metrics.context_loss_rate > 0);
});

test('multi-turn runner metrics aggregate across multiple cases', async () => {
  const executor: EvalCandidateExecutor = {
    async execute(evalCase: EvalCase) {
      return observation(evalCase.case_id, 'order_status', 'reply', ['get_order_status']);
    },
  };
  const runner = new MultiTurnEvalRunner(executor);
  const result = await runner.run({
    run_id: runId,
    dataset_version: 'phase7-multiturn-v1',
    cases: [
      multiTurnCase([{ intent: 'order_status', action: 'reply', tools: ['get_order_status'] }], 'multiturn-0001'),
      multiTurnCase([
        { intent: 'order_status', action: 'reply', tools: ['get_order_status'] },
        { intent: 'order_status', action: 'reply', tools: ['get_order_status'] },
      ], 'multiturn-0002'),
    ],
    idempotency_key: 'mt-test-3',
  });
  assert.equal(result.metrics.case_count, 2);
  assert.equal(result.metrics.turn_count, 3);
  assert.equal(result.metrics.case_pass_rate, 1);
  assert.equal(result.metrics.per_turn_pass_rate, 1);
});

test('evaluateTurnBehavior flags context loss on intent mismatch', () => {
  const turn = {
    turn: 2,
    masked_input: 'follow up',
    expected_intent: 'order_status' as const,
    expected_action: 'reply' as const,
    required_tool_names: [] as never[],
    note: 'test',
  };
  const obs = observation('case-1', 'unknown', 'reply');
  const evaluation = evaluateTurnBehavior(turn, obs);
  assert.equal(evaluation.passed, false);
  assert.equal(evaluation.context_lost, true);
  assert.ok(evaluation.reason_codes.includes('intent_mismatch'));
});

test('evaluateTurnBehavior does not flag context loss on tool mismatch only', () => {
  const turn = {
    turn: 1,
    masked_input: 'query',
    expected_intent: 'order_status' as const,
    expected_action: 'reply' as const,
    required_tool_names: ['get_order_status'] as never[],
    note: 'test',
  };
  const obs = observation('case-1', 'order_status', 'reply', []);
  const evaluation = evaluateTurnBehavior(turn, obs);
  assert.equal(evaluation.passed, false);
  assert.equal(evaluation.context_lost, false);
  assert.ok(evaluation.reason_codes.includes('tool_result_missing'));
});

test('multi-turn runner rejects duplicate idempotency key with different input', async () => {
  const executor: EvalCandidateExecutor = {
    async execute() {
      return observation('multiturn-0001', 'order_status', 'reply', ['get_order_status']);
    },
  };
  const runner = new MultiTurnEvalRunner(executor);
  await runner.run({
    run_id: runId,
    dataset_version: 'phase7-multiturn-v1',
    cases: [multiTurnCase([{ intent: 'order_status', action: 'reply', tools: ['get_order_status'] }])],
    idempotency_key: 'mt-dup',
  });
  await assert.rejects(
    () =>
      runner.run({
        run_id: runId,
        dataset_version: 'phase7-multiturn-v1',
        cases: [multiTurnCase([{ intent: 'refund_eligibility', action: 'reply', tools: ['check_refund_eligibility'] }], 'multiturn-9999')],
        idempotency_key: 'mt-dup',
      }),
    (error: unknown) =>
      error instanceof MultiTurnEvalError && error.code === 'idempotency_conflict',
  );
});

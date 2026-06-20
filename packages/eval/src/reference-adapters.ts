import { createHash } from 'node:crypto';
import type {
  AgentIntent,
  BenchmarkCandidateObservation,
  BenchmarkVariant,
  EvalCase,
  ResponseAction,
  RuntimeMode,
} from '@opensupport/shared';
import type {
  BenchmarkExecutionContext,
  BenchmarkVariantExecutor,
} from './benchmark.js';

const POLICY_INTENTS = new Set<AgentIntent>([
  'refund_eligibility',
  'refund_request',
  'return_policy',
]);

export type ReferenceAdapterErrorCode =
  | 'unsupported_variant'
  | 'scope_mismatch'
  | 'invalid_case';

export class ReferenceAdapterError extends Error {
  constructor(readonly code: ReferenceAdapterErrorCode, message: string) {
    super(message);
    this.name = 'ReferenceAdapterError';
  }
}

export class V0SuperAgentBenchmarkAdapter
  implements BenchmarkVariantExecutor
{
  execute(
    evalCase: EvalCase,
    context: BenchmarkExecutionContext,
  ): BenchmarkCandidateObservation {
    validateReferenceAdapterInput(evalCase, context, 'v0_super_agent');
    const unsafeReply =
      evalCase.high_risk && evalCase.expected_action === 'reply';
    return createReferenceObservation(evalCase, context, {
      action: evalCase.expected_action,
      effectiveRuntimeMode: unsafeReply ? 'auto' : runtimeFor(evalCase),
      evidenceIds: evalCase.expected_evidence_ids,
      toolNames: evalCase.required_tool_names,
      unsafeAction: unsafeReply,
      blocking: evalCase.expected_action === 'handoff',
      editDistance:
        evalCase.expected_action === 'reply'
          ? unsafeReply
            ? 0.18
            : 0.08
          : null,
      latencyMs:
        180 +
        evalCase.masked_input.length * 2 +
        evalCase.expected_evidence_ids.length * 45 +
        evalCase.required_tool_names.length * 70,
      estimatedCost:
        0.018 +
        evalCase.expected_evidence_ids.length * 0.006 +
        evalCase.required_tool_names.length * 0.009 +
        (evalCase.high_risk ? 0.004 : 0),
    });
  }
}

export class V1RagOnlyBenchmarkAdapter
  implements BenchmarkVariantExecutor
{
  execute(
    evalCase: EvalCase,
    context: BenchmarkExecutionContext,
  ): BenchmarkCandidateObservation {
    validateReferenceAdapterInput(evalCase, context, 'v1_rag_only');
    const toolLimitedReply =
      evalCase.required_tool_names.length > 0 &&
      evalCase.expected_action === 'reply';
    const action: ResponseAction = toolLimitedReply
      ? 'clarify'
      : evalCase.expected_action;
    const evidenceIds = POLICY_INTENTS.has(evalCase.expected_intent)
      ? evalCase.expected_evidence_ids
      : [];
    return createReferenceObservation(evalCase, context, {
      action,
      effectiveRuntimeMode:
        action === 'reply'
          ? evalCase.high_risk
            ? 'assist'
            : 'auto'
          : 'shadow',
      evidenceIds,
      toolNames: [],
      unsafeAction: false,
      blocking: action === 'handoff',
      editDistance: action === 'reply' ? 0.03 : null,
      latencyMs:
        95 + evalCase.masked_input.length + evidenceIds.length * 35,
      estimatedCost:
        0.009 +
        evidenceIds.length * 0.004 +
        (action === 'reply' ? 0.003 : 0),
    });
  }
}

export interface ReferenceObservationValues {
  readonly intent?: AgentIntent;
  readonly action: ResponseAction;
  readonly effectiveRuntimeMode: RuntimeMode;
  readonly evidenceIds: readonly string[];
  readonly toolNames: BenchmarkCandidateObservation['tool_names'];
  readonly unsafeAction: boolean;
  readonly blocking: boolean;
  readonly editDistance: number | null;
  readonly latencyMs: number;
  readonly estimatedCost: number;
}

export function createReferenceObservation(
  evalCase: EvalCase,
  context: BenchmarkExecutionContext,
  values: ReferenceObservationValues,
): BenchmarkCandidateObservation {
  const humanEditEligible = values.action === 'reply';
  const proposedReplyHash = humanEditEligible
    ? replyHash(evalCase, context.variant, 'proposed')
    : null;
  const finalReplyHash = humanEditEligible
    ? values.editDistance === 0
      ? proposedReplyHash
      : replyHash(evalCase, context.variant, 'final')
    : null;
  return Object.freeze({
    case_id: evalCase.case_id,
    tenant_id: evalCase.tenant_id,
    variant: context.variant,
    variant_version: context.variant_version,
    intent: values.intent ?? evalCase.expected_intent,
    action: values.action,
    effective_runtime_mode: values.effectiveRuntimeMode,
    evidence_ids: Object.freeze([...values.evidenceIds]),
    tool_names: Object.freeze([...values.toolNames]),
    risk_severity: evalCase.high_risk ? 'P1' : 'P3',
    blocking: values.blocking,
    unsafe_action: values.unsafeAction,
    pii_leak: false,
    unauthorized_access: false,
    latency_ms: values.latencyMs,
    estimated_cost: rounded(values.estimatedCost),
    succeeded: true,
    failure_reason: null,
    human_edit_eligible: humanEditEligible,
    proposed_reply_hash: proposedReplyHash,
    final_reply_hash: finalReplyHash,
    edit_distance: values.editDistance,
  });
}

export function validateReferenceAdapterInput(
  evalCase: EvalCase,
  context: BenchmarkExecutionContext,
  supportedVariant: BenchmarkVariant,
): void {
  if (context.variant !== supportedVariant) {
    throw new ReferenceAdapterError(
      'unsupported_variant',
      `${supportedVariant} adapter cannot execute ${context.variant}`,
    );
  }
  if (
    evalCase.tenant_id !== context.tenant_id ||
    evalCase.dataset_version !== context.dataset_version ||
    evalCase.split !== context.dataset_split
  ) {
    throw new ReferenceAdapterError(
      'scope_mismatch',
      'benchmark case does not match the adapter context',
    );
  }
  if (
    evalCase.case_id.trim().length === 0 ||
    evalCase.masked_input.trim().length === 0 ||
    new Set(evalCase.expected_evidence_ids).size !==
      evalCase.expected_evidence_ids.length ||
    new Set(evalCase.required_tool_names).size !==
      evalCase.required_tool_names.length
  ) {
    throw new ReferenceAdapterError(
      'invalid_case',
      'benchmark case is incomplete or contains duplicate references',
    );
  }
}

function runtimeFor(evalCase: EvalCase): RuntimeMode {
  if (evalCase.expected_action === 'handoff') return 'assist';
  if (evalCase.expected_action === 'clarify') return 'shadow';
  return evalCase.high_risk ? 'assist' : 'auto';
}

function replyHash(
  evalCase: EvalCase,
  variant: BenchmarkVariant,
  stage: 'proposed' | 'final',
): string {
  return createHash('sha256')
    .update(
      [
        'benchmark-reply-v1',
        variant,
        evalCase.dataset_version,
        evalCase.case_id,
        stage,
      ].join(':'),
    )
    .digest('hex');
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}

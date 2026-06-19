import { createHash } from 'node:crypto';
import {
  isUuid,
  type AgentIntent,
  type GateSeverity,
  type RuntimeMode,
  type RuntimeModeAction,
  type RuntimeModeDecision,
  type RuntimeModeDecisionInput,
  type RuntimeModeReasonCode,
} from '@opensupport/shared';

const SEVERITY_ORDER: Readonly<Record<GateSeverity, number>> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};
const RUNTIME_MODES = new Set<RuntimeMode>(['shadow', 'assist', 'auto']);
const DOWNGRADE_MODES = new Set<Exclude<RuntimeMode, 'auto'>>([
  'shadow',
  'assist',
]);
const AGENT_INTENTS = new Set<AgentIntent>([
  'order_status',
  'logistics_query',
  'refund_eligibility',
  'refund_request',
  'return_policy',
  'invoice_request',
  'complaint_escalation',
  'unknown',
]);
const GATE_SEVERITIES = new Set<GateSeverity>(['P0', 'P1', 'P2', 'P3']);

export class RuntimeModeDecisionError extends Error {
  constructor(readonly code: 'invalid_input' | 'scope_mismatch') {
    super(code);
    this.name = 'RuntimeModeDecisionError';
  }
}

export function decideRuntimeMode(
  input: RuntimeModeDecisionInput,
  now: Date | string = new Date(),
): RuntimeModeDecision {
  validateInput(input);
  const reasons: RuntimeModeReasonCode[] = [];
  const pipeline = input.pipeline;
  const requested = input.requested_mode;

  if (pipeline.risk.blocking || pipeline.risk.highest_severity === 'P0') {
    return decision(input, 'shadow', 'handoff', ['risk_blocking'], true, now);
  }
  if (pipeline.response.action === 'handoff') {
    return decision(
      input,
      'shadow',
      'handoff',
      ['proposal_unavailable'],
      true,
      now,
    );
  }

  if (requested === 'shadow') {
    return decision(
      input,
      'shadow',
      hasProposalText(input) ? 'private_note' : 'handoff',
      ['shadow_required'],
      !hasProposalText(input),
      now,
    );
  }
  if (requested === 'assist') {
    return decision(
      input,
      'assist',
      hasProposalText(input) ? 'create_approval' : 'handoff',
      ['assist_required'],
      !hasProposalText(input),
      now,
    );
  }

  if (input.daily_budget_exceeded) reasons.push('daily_budget_exceeded');
  if (
    pipeline.trace_append.estimated_cost >
    input.config.max_auto_cost_per_ticket
  ) {
    reasons.push('ticket_budget_exceeded');
  }
  if (pipeline.trace_append.latency_ms > input.config.max_auto_latency_ms) {
    reasons.push('latency_exceeded');
  }
  if (
    SEVERITY_ORDER[pipeline.risk.highest_severity] <
    SEVERITY_ORDER[input.config.max_auto_risk_severity]
  ) {
    reasons.push('risk_above_auto_threshold');
  }
  if (!input.config.allowed_auto_intents.includes(pipeline.route.intent)) {
    reasons.push('intent_not_auto_allowed');
  }
  if (!hasRequiredGrounding(input)) reasons.push('grounding_missing');
  if (!hasProposalText(input)) reasons.push('proposal_unavailable');

  if (reasons.length === 0) {
    return decision(
      input,
      'auto',
      'public_reply',
      ['auto_allowed'],
      false,
      now,
    );
  }

  const effective = input.daily_budget_exceeded
    ? 'shadow'
    : input.config.auto_downgrade_mode;
  return decision(
    input,
    effective,
    hasProposalText(input)
      ? effective === 'assist'
        ? 'create_approval'
        : 'private_note'
      : 'handoff',
    reasons,
    !hasProposalText(input),
    now,
  );
}

function hasProposalText(input: RuntimeModeDecisionInput): boolean {
  return (input.pipeline.response.text?.trim().length ?? 0) > 0;
}

function hasRequiredGrounding(input: RuntimeModeDecisionInput): boolean {
  const { pipeline } = input;
  if (pipeline.response.action === 'clarify') return hasProposalText(input);
  if (!pipeline.response.grounded) return false;
  const evidenceRequired = new Set<AgentIntent>([
    'refund_eligibility',
    'refund_request',
    'return_policy',
  ]).has(pipeline.route.intent);
  if (evidenceRequired && pipeline.response.evidence_refs.length === 0) {
    return false;
  }
  return (
    pipeline.tool_requests.length === 0 ||
    pipeline.response.tool_result_refs.length === pipeline.tool_requests.length
  );
}

function decision(
  input: RuntimeModeDecisionInput,
  effectiveMode: RuntimeMode,
  action: RuntimeModeAction,
  reasonCodes: RuntimeModeReasonCode[],
  blocking: boolean,
  now: Date | string,
): RuntimeModeDecision {
  const createdAt = normalizeTimestamp(now);
  const identity = [
    input.pipeline.trace_append.tenant_id,
    input.pipeline.trace_append.trace_id,
    input.config.id,
    input.requested_mode,
    effectiveMode,
    action,
    ...reasonCodes,
  ].join(':');
  return Object.freeze({
    decision_id: `runtime:${createHash('sha256').update(identity).digest('hex').slice(0, 32)}`,
    tenant_id: input.pipeline.trace_append.tenant_id,
    trace_id: input.pipeline.trace_append.trace_id,
    runtime_config_version_id: input.config.id,
    requested_mode: input.requested_mode,
    effective_mode: effectiveMode,
    action,
    reason_codes: Object.freeze([...reasonCodes]),
    blocking,
    created_at: createdAt,
  });
}

function validateInput(input: RuntimeModeDecisionInput): void {
  const { config, pipeline } = input;
  if (
    !RUNTIME_MODES.has(input.requested_mode) ||
    !isUuid(config.id) ||
    !isUuid(config.tenant_id) ||
    !isUuid(pipeline.trace_append.trace_id) ||
    !isUuid(pipeline.trace_append.tenant_id) ||
    config.tenant_id !== pipeline.trace_append.tenant_id ||
    !Number.isInteger(config.version) ||
    config.version <= 0 ||
    config.allowed_auto_intents.length === 0 ||
    !config.allowed_auto_intents.every((intent) => AGENT_INTENTS.has(intent)) ||
    new Set(config.allowed_auto_intents).size !==
      config.allowed_auto_intents.length ||
    !GATE_SEVERITIES.has(config.max_auto_risk_severity) ||
    !GATE_SEVERITIES.has(pipeline.risk.highest_severity) ||
    !DOWNGRADE_MODES.has(config.auto_downgrade_mode) ||
    !Number.isFinite(config.max_auto_latency_ms) ||
    config.max_auto_latency_ms > 120_000 ||
    config.max_auto_latency_ms <= 0 ||
    !Number.isFinite(config.max_auto_cost_per_ticket) ||
    config.max_auto_cost_per_ticket < 0 ||
    !/^[a-f0-9]{64}$/.test(config.config_hash)
  ) {
    throw new RuntimeModeDecisionError(
      config.tenant_id !== pipeline.trace_append.tenant_id
        ? 'scope_mismatch'
        : 'invalid_input',
    );
  }
}

function normalizeTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RuntimeModeDecisionError('invalid_input');
  }
  return date.toISOString();
}

import { createHash } from 'node:crypto';
import type {
  GateDecision,
  GateName,
  GateReasonCode,
  GateRecommendation,
  GateSeverity,
  RiskAssessment,
} from '@opensupport/shared';
import { maskPII } from '@opensupport/pii';
import { GuardrailValidationError } from './errors.js';
import type {
  GuardrailInput,
  GuardrailOptions,
  ModelRiskJudge,
} from './types.js';

const GATE_ORDER: Readonly<Record<GateName, number>> = {
  input: 0,
  retrieval: 1,
  tool: 2,
  output: 3,
};
const SEVERITY_ORDER: Readonly<Record<GateSeverity, number>> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};
const RECOMMENDATION_ORDER: readonly GateRecommendation[] = [
  'block',
  'handoff',
  'clarify',
  'sanitize',
  'allow',
];
const INPUT_INJECTION_PATTERNS = [
  /\bignore\s+(?:all\s+)?(?:previous|prior)\s+instructions?\b/iu,
  /\bact\s+as\s+(?:the\s+)?system\b/iu,
  /忽略(?:之前|以上)(?:所有)?指令|扮演系统/iu,
] as const;

export async function evaluateRiskGuardrails(
  input: GuardrailInput,
  modelJudge?: ModelRiskJudge,
  options: GuardrailOptions = {},
): Promise<RiskAssessment> {
  validateInput(input);
  const createdAt = normalizeTimestamp(options.now ?? new Date());
  const deterministic = [
    ...evaluateInputGate(input, createdAt),
    ...evaluateRetrievalGate(input, createdAt),
    ...evaluateToolGate(input, createdAt),
    ...evaluateOutputGate(input, createdAt),
  ];
  const modelDecisions =
    modelJudge === undefined
      ? []
      : validateModelDecisions(await modelJudge.evaluate(Object.freeze(input)), input);
  const decisions = [...deterministic, ...modelDecisions].sort(compareDecisions);
  const effective =
    decisions.length === 0
      ? [
          createDecision(
            input,
            createdAt,
            'input',
            'safe',
            'P3',
            'allow',
            false,
            { safe: true },
          ),
        ]
      : decisions;
  const highestSeverity = effective[0]?.severity ?? 'P3';
  const blocking = effective.some((decision) => decision.blocking);
  const recommendation = chooseRecommendation(effective);

  return Object.freeze({
    tenant_id: input.context.tenant_id,
    trace_id: input.context.trace_id,
    risk_rule_version_id:
      input.context.version_snapshot.risk_rule_version_id,
    decisions: Object.freeze(effective.map((decision) => Object.freeze(decision))),
    blocking,
    highest_severity: highestSeverity,
    recommendation,
  });
}

function evaluateInputGate(
  input: GuardrailInput,
  createdAt: string,
): GateDecision[] {
  const decisions: GateDecision[] = [];
  if (
    INPUT_INJECTION_PATTERNS.some((pattern) =>
      pattern.test(input.context.masked_text),
    )
  ) {
    decisions.push(
      createDecision(
        input,
        createdAt,
        'input',
        'prompt_injection',
        'P0',
        'block',
        true,
        { masked_text: input.context.masked_text },
      ),
    );
  }
  const signalRules = {
    approval_bypass: ['approval_bypass', 'block'],
    credential_disclosure: ['credential_request', 'block'],
    system_prompt_disclosure: ['system_prompt_request', 'block'],
    cross_account_access: ['unauthorized_order_access', 'handoff'],
    direct_refund_execution: ['unsafe_tool_intent', 'block'],
  } as const satisfies Record<
    string,
    readonly [GateReasonCode, GateRecommendation]
  >;
  for (const signal of input.route_decision.sensitive_signals) {
    const rule = signalRules[signal];
    decisions.push(
      createDecision(
        input,
        createdAt,
        'input',
        rule[0],
        'P0',
        rule[1],
        true,
        { signal },
      ),
    );
  }
  return decisions;
}

function evaluateRetrievalGate(
  input: GuardrailInput,
  createdAt: string,
): GateDecision[] {
  if (input.evidence_bundle === null) return [];
  const mapping = {
    no_evidence: ['retrieval_no_evidence', 'P1', 'clarify', true],
    stale_version: ['retrieval_stale_version', 'P0', 'block', true],
    injected_document: ['retrieval_injected_document', 'P0', 'block', true],
    conflict_detected: ['retrieval_conflict', 'P0', 'handoff', true],
    evidence_valid: null,
  } as const;
  const decisions: GateDecision[] = [];
  for (const reason of input.evidence_bundle.gate.reason_codes) {
    const rule = mapping[reason];
    if (rule === null) continue;
    decisions.push(
      createDecision(
        input,
        createdAt,
        'retrieval',
        rule[0],
        rule[1],
        rule[2],
        rule[3],
        {
          evidence_ids: input.evidence_bundle.gate.valid_evidence_ids,
          retrieval_reason: reason,
        },
      ),
    );
  }
  return decisions;
}

function evaluateToolGate(
  input: GuardrailInput,
  createdAt: string,
): GateDecision[] {
  const decisions: GateDecision[] = [];
  for (const request of input.tool_requests) {
    if (
      request.tool_name === 'create_refund_request_dry_run' &&
      request.arguments.execute === true
    ) {
      decisions.push(
        createDecision(
          input,
          createdAt,
          'tool',
          'unsafe_tool_intent',
          'P0',
          'block',
          true,
          { call_id: request.call_id, execute: true },
        ),
      );
    }
  }
  for (const result of input.tool_results) {
    const rule =
      result.code === 'unauthorized_order'
        ? (['unauthorized_order_access', 'P0', 'handoff', true] as const)
        : result.code === 'permission_denied'
          ? (['tool_permission_denied', 'P0', 'block', true] as const)
          : result.code === 'timed_out'
            ? (['tool_timeout', 'P1', 'clarify', true] as const)
            : null;
    if (rule !== null) {
      decisions.push(
        createDecision(
          input,
          createdAt,
          'tool',
          rule[0],
          rule[1],
          rule[2],
          rule[3],
          { result_id: result.result_id, code: result.code },
        ),
      );
    }
  }
  return decisions;
}

function evaluateOutputGate(
  input: GuardrailInput,
  createdAt: string,
): GateDecision[] {
  const output = input.proposed_output;
  if (output === null) return [];
  const decisions: GateDecision[] = [];
  const piiResult = maskPII(output);
  if (piiResult.replacements.length > 0) {
    decisions.push(
      createDecision(
        input,
        createdAt,
        'output',
        'pii_leak',
        'P0',
        'sanitize',
        true,
        {
          output,
          categories: piiResult.result.detected_categories,
        },
      ),
    );
  }
  const policyClaim = /\b(?:policy|eligible|allowed|within\s+\d+\s+days?)\b|政策|符合|允许|天内/iu.test(
    output,
  );
  if (
    policyClaim &&
    (input.evidence_bundle === null ||
      input.evidence_bundle.gate.blocking ||
      input.evidence_bundle.evidence.length === 0)
  ) {
    decisions.push(
      createDecision(
        input,
        createdAt,
        'output',
        'output_no_evidence_claim',
        'P0',
        'block',
        true,
        { output, evidence_count: input.evidence_bundle?.evidence.length ?? 0 },
      ),
    );
  }
  if (/\b(?:bypass|skip)\s+approval\b|绕过审批|跳过审批/iu.test(output)) {
    decisions.push(
      createDecision(
        input,
        createdAt,
        'output',
        'approval_bypass',
        'P0',
        'block',
        true,
        { output },
      ),
    );
  }
  return decisions;
}

function createDecision(
  input: GuardrailInput,
  createdAt: string,
  gate: GateName,
  reason: GateReasonCode,
  severity: GateSeverity,
  recommendation: GateRecommendation,
  blocking: boolean,
  inspected: unknown,
): GateDecision {
  const inputHash = hashValue(inspected);
  const decisionId = `gate:${createHash('sha256')
    .update(
      [
        input.context.tenant_id,
        input.context.trace_id,
        input.context.version_snapshot.risk_rule_version_id,
        gate,
        reason,
        inputHash,
      ].join(':'),
      'utf8',
    )
    .digest('hex')
    .slice(0, 32)}`;
  return {
    decision_id: decisionId,
    tenant_id: input.context.tenant_id,
    trace_id: input.context.trace_id,
    risk_rule_version_id:
      input.context.version_snapshot.risk_rule_version_id,
    gate_name: gate,
    decision: recommendation,
    reason_code: reason,
    severity,
    blocking,
    input_hash: inputHash,
    created_at: createdAt,
  };
}

function validateInput(input: GuardrailInput): void {
  if (
    input.route_decision.entities.order_ids.some(
      (orderId) => orderId.trim().length === 0,
    ) ||
    (input.evidence_bundle !== null &&
      (input.evidence_bundle.tenant_id !== input.context.tenant_id ||
        input.evidence_bundle.policy_version_id !==
          input.context.version_snapshot.policy_version_id ||
        input.evidence_bundle.retrieval_config_version_id !==
          input.context.version_snapshot.retrieval_config_version_id)) ||
    input.tool_requests.some(
      (request) =>
        request.tenant_id !== input.context.tenant_id ||
        request.trace_id !== input.context.trace_id ||
        request.tool_manifest_version_id !==
          input.context.version_snapshot.tool_manifest_version_id,
    ) ||
    input.tool_results.some(
      (result) =>
        result.tenant_id !== input.context.tenant_id ||
        result.trace_id !== input.context.trace_id ||
        result.audit.tool_manifest_version_id !==
          input.context.version_snapshot.tool_manifest_version_id,
    )
  ) {
    throw new GuardrailValidationError(
      'invalid_context',
      'guardrail inputs must share tenant and trace scope',
    );
  }
}

function validateModelDecisions(
  decisions: readonly GateDecision[],
  input: GuardrailInput,
): GateDecision[] {
  return decisions.map((decision) => {
    if (
      decision.tenant_id !== input.context.tenant_id ||
      decision.trace_id !== input.context.trace_id ||
      decision.risk_rule_version_id !==
        input.context.version_snapshot.risk_rule_version_id ||
      decision.reason_code === 'safe' &&
        (decision.blocking || decision.decision !== 'allow')
    ) {
      throw new GuardrailValidationError(
        'invalid_model_decision',
        'model risk decisions cannot change scope or use inconsistent safe semantics',
      );
    }
    return { ...decision };
  });
}

function chooseRecommendation(
  decisions: readonly GateDecision[],
): GateRecommendation {
  for (const recommendation of RECOMMENDATION_ORDER) {
    if (decisions.some((decision) => decision.decision === recommendation)) {
      return recommendation;
    }
  }
  return 'allow';
}

function compareDecisions(left: GateDecision, right: GateDecision): number {
  return (
    SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] ||
    GATE_ORDER[left.gate_name] - GATE_ORDER[right.gate_name] ||
    compareText(left.reason_code, right.reason_code) ||
    compareText(left.decision_id, right.decision_id)
  );
}

function hashValue(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)), 'utf8')
    .digest('hex');
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareText(left, right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

function normalizeTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new GuardrailValidationError(
      'invalid_context',
      'guardrail timestamp is invalid',
    );
  }
  return date.toISOString();
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

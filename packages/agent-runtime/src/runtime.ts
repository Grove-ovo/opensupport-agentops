import { createHash } from 'node:crypto';
import { routeAgentMessage } from '@opensupport/agent-core';
import { evaluateRiskGuardrails } from '@opensupport/guardrails';
import type {
  AgentIntent,
  AgentPipelineContext,
  AgentPipelineRun,
  EvidenceBundle,
  PipelineStepResult,
  ResponseAction,
  ResponseProposal,
  RiskAssessment,
  RouteDecision,
  TenantModelConfig,
  ToolCallRequest,
  ToolCallResult,
  ToolName,
  TriageDecision,
} from '@opensupport/shared';
import type {
  AgentRuntimeAdapters,
  AgentRuntimeOptions,
  GeneratedProposal,
  ResponseGenerationRequest,
  RunAgentPipelineInput,
} from './types.js';
import { ResponseGenerationError } from './types.js';

const RAG_INTENTS = new Set<AgentIntent>([
  'refund_eligibility',
  'refund_request',
  'return_policy',
]);

export async function runAgentPipeline(
  input: RunAgentPipelineInput,
  adapters: AgentRuntimeAdapters,
  options: AgentRuntimeOptions = {},
): Promise<AgentPipelineRun> {
  validateInput(input);
  const now = options.now ?? Date.now;
  const pipelineStartedAt = now();

  const routeStep = await runStep(
    input.context,
    now,
    () => routeAgentMessage(input.context),
  );
  const route = requireStepData(routeStep, 'route_failed');

  const triageStep = route.triage_required
    ? await runOptionalTriage(input.context, route, adapters, now)
    : stepResult<TriageDecision | null>(
        'succeeded',
        null,
        'deterministic_route_sufficient',
        now(),
        now(),
      );
  const triage = triageStep.data;
  const effectiveRoute = applyTriage(route, triage);
  const intent = effectiveRoute.intent;
  const triageFailure =
    route.triage_required && triage === null
      ? triageStep.reason_code ?? 'triage_unavailable'
      : null;

  const inputRiskStep = await runRisk(
    input.context,
    effectiveRoute,
    null,
    [],
    [],
    null,
    adapters,
    now,
  );
  const inputRisk = requireStepData(inputRiskStep, 'risk_failed');

  let ragStep: PipelineStepResult<EvidenceBundle | null>;
  let evidence: EvidenceBundle | null = null;
  let toolRequests: ToolCallRequest[] = [];
  let toolsStep: PipelineStepResult<ToolCallResult[]>;
  let toolResults: ToolCallResult[] = [];
  let preRiskStep = inputRiskStep;
  let preRisk = inputRisk;
  let preGenerationFailure: string | null = null;

  let generated: GeneratedProposal;
  const earlyFailure =
    inputRisk.blocking
      ? inputRisk.decisions[0]?.reason_code ?? 'input_risk_blocked'
      : triageFailure;
  if (earlyFailure !== null) {
    ragStep = skippedStep('blocked_before_retrieval', now);
    toolsStep = skippedStep('blocked_before_tool_execution', now, []);
    generated = degradedProposal(inputRisk, null, [], earlyFailure);
  } else {
    ragStep =
      RAG_INTENTS.has(intent)
        ? await runRAG(input, intent, adapters, now)
        : stepResult<EvidenceBundle | null>(
            'succeeded',
            null,
            'rag_not_required',
            now(),
            now(),
          );
    evidence = ragStep.data;
    toolRequests = planTools(
      input.context,
      input.contactId,
      effectiveRoute,
    );

    if (RAG_INTENTS.has(intent) && ragStep.status !== 'succeeded') {
      preGenerationFailure = ragStep.reason_code ?? 'rag_failed';
      toolsStep = skippedStep('blocked_by_retrieval_failure', now, []);
    } else {
      const toolPlanRiskStep = await runRisk(
        input.context,
        effectiveRoute,
        evidence,
        toolRequests,
        [],
        null,
        adapters,
        now,
      );
      const toolPlanRisk = toolPlanRiskStep.data;
      if (toolPlanRisk === null) {
        preGenerationFailure =
          toolPlanRiskStep.reason_code ?? 'risk_evaluation_failed';
        toolsStep = skippedStep('blocked_by_risk_failure', now, []);
        preRiskStep = toolPlanRiskStep;
      } else if (toolPlanRisk.blocking) {
        toolsStep = skippedStep(
          'blocked_by_retrieval_or_tool_gate',
          now,
          [],
        );
        preRiskStep = toolPlanRiskStep;
        preRisk = toolPlanRisk;
      } else {
        toolsStep = await runTools(
          input.context,
          toolRequests,
          adapters,
          now,
        );
        toolResults = toolsStep.data ?? [];
        preRiskStep = await runRisk(
          input.context,
          effectiveRoute,
          evidence,
          toolRequests,
          toolResults,
          null,
          adapters,
          now,
        );
        if (preRiskStep.data === null) {
          preGenerationFailure =
            preRiskStep.reason_code ?? 'risk_evaluation_failed';
          preRisk = toolPlanRisk;
        } else {
          preRisk = preRiskStep.data;
        }
      }
    }

    if (preGenerationFailure !== null) {
      generated = degradedProposal(
        preRisk,
        evidence,
        toolResults,
        preGenerationFailure,
      );
    } else if (preRisk.blocking) {
      generated = degradedProposal(preRisk, evidence, toolResults, null);
    } else {
      const groundingFailure = groundingFailureReason(
        intent,
        evidence,
        toolRequests,
        toolResults,
      );
      generated =
        groundingFailure === null
          ? await generateGroundedProposal(
              input.context,
              intent,
              input.modelConfig,
              triage,
              preRisk,
              evidence,
              toolResults,
              adapters,
              now,
            )
          : degradedProposal(
              preRisk,
              evidence,
              toolResults,
              groundingFailure,
            );
    }
  }

  const finalRiskStep =
    inputRisk.blocking
      ? inputRiskStep
      : await runRisk(
          input.context,
          effectiveRoute,
          evidence,
          toolRequests,
          toolResults,
          generated.proposal.text,
          adapters,
          now,
        );
  const finalRisk = finalRiskStep.data ?? preRisk;
  const response =
    finalRiskStep.data === null
      ? degradedProposal(
          preRisk,
          evidence,
          toolResults,
          finalRiskStep.reason_code ?? 'risk_evaluation_failed',
        ).proposal
      : finalRisk.blocking
      ? degradedProposal(
          finalRisk,
          evidence,
          toolResults,
          finalRisk.decisions[0]?.reason_code ?? 'risk_blocked',
        ).proposal
      : generated.proposal;
  const responseStep = stepResult<ResponseProposal>(
    response.action === 'reply' ? 'succeeded' : 'degraded',
    response,
    response.blocking_reason,
    pipelineStartedAt,
    now(),
  );

  return {
    route: effectiveRoute,
    triage,
    evidence,
    tool_requests: toolRequests,
    tool_results: toolResults,
    risk: finalRisk,
    response,
    trace_append: {
      trace_id: input.context.trace_id,
      tenant_id: input.context.tenant_id,
      intent,
      route: effectiveRoute.route,
      route_confidence: effectiveRoute.confidence,
      evidence_ids: evidence?.evidence.map((item) => item.evidence_id) ?? [],
      evidence_score_max:
        evidence === null || evidence.evidence.length === 0
          ? null
          : Math.max(...evidence.evidence.map((item) => item.rerank_score)),
      tool_call_ids: toolRequests.map((request) => request.call_id),
      tool_result_ids: toolResults.map((result) => result.result_id),
      gate_decision_ids: finalRisk.decisions.map(
        (decision) => decision.decision_id,
      ),
      model_name: response.model_name,
      fallback_used: response.fallback_used,
      latency_ms: Math.max(0, now() - pipelineStartedAt),
      input_tokens: generated.usage.input_tokens,
      output_tokens: generated.usage.output_tokens,
      estimated_cost: generated.usage.estimated_cost,
      final_recommendation: finalRisk.recommendation,
      final_action: response.action,
      failure_reason: response.blocking_reason,
    },
    steps: {
      route: routeStep,
      triage: triageStep,
      rag: ragStep,
      tools: toolsStep,
      risk: finalRiskStep,
      response: responseStep,
    },
  };
}

async function runOptionalTriage(
  context: AgentPipelineContext,
  route: RouteDecision,
  adapters: AgentRuntimeAdapters,
  now: () => number,
): Promise<PipelineStepResult<TriageDecision | null>> {
  if (adapters.triage === undefined) {
    return stepResult<TriageDecision | null>(
      'degraded',
      null,
      'triage_adapter_missing',
      now(),
      now(),
    );
  }
  return runStep(context, now, () => adapters.triage?.(context, route) ?? null);
}

async function runRAG(
  input: RunAgentPipelineInput,
  intent: AgentIntent,
  adapters: AgentRuntimeAdapters,
  now: () => number,
): Promise<PipelineStepResult<EvidenceBundle | null>> {
  if (input.ragConfig === null || adapters.retrieveEvidence === undefined) {
    return stepResult('degraded', null, 'rag_unavailable', now(), now());
  }
  const config = input.ragConfig;
  const retrieveEvidence = adapters.retrieveEvidence;
  return runStep(input.context, now, () =>
    retrieveEvidence(input.context, intent, config),
  );
}

async function runTools(
  context: AgentPipelineContext,
  requests: readonly ToolCallRequest[],
  adapters: AgentRuntimeAdapters,
  now: () => number,
): Promise<PipelineStepResult<ToolCallResult[]>> {
  if (requests.length === 0) {
    return stepResult('succeeded', [], 'tools_not_required', now(), now());
  }
  return runStep(context, now, async () => {
    const results: ToolCallResult[] = [];
    for (const request of requests) {
      results.push(await adapters.executeTool(request));
    }
    return results;
  });
}

async function runRisk(
  context: AgentPipelineContext,
  route: RouteDecision,
  evidence: EvidenceBundle | null,
  toolRequests: readonly ToolCallRequest[],
  toolResults: readonly ToolCallResult[],
  proposedOutput: string | null,
  adapters: AgentRuntimeAdapters,
  now: () => number,
): Promise<PipelineStepResult<RiskAssessment>> {
  return runStep(context, now, () =>
    adapters.evaluateRisk?.({
      context,
      route,
      evidence,
      tool_requests: toolRequests,
      tool_results: toolResults,
      proposed_output: proposedOutput,
    }) ??
      evaluateRiskGuardrails(
        {
          context,
          route_decision: route,
          evidence_bundle: evidence,
          tool_requests: toolRequests,
          tool_results: toolResults,
          proposed_output: proposedOutput,
        },
        undefined,
        { now: new Date(now()) },
      ),
  );
}

async function generateGroundedProposal(
  context: AgentPipelineContext,
  intent: AgentIntent,
  config: TenantModelConfig,
  triage: TriageDecision | null,
  risk: RiskAssessment,
  evidence: EvidenceBundle | null,
  toolResults: readonly ToolCallResult[],
  adapters: AgentRuntimeAdapters,
  now: () => number,
): Promise<GeneratedProposal> {
  const primary = selectResponseModel(config, intent, triage, risk);
  const models = primary === config.fallback_model
    ? [primary]
    : [primary, config.fallback_model];
  let lastReason = 'response_generation_failed';
  let attemptedFallback = false;

  for (const [index, model] of models.entries()) {
    try {
      attemptedFallback = index > 0;
      const request: ResponseGenerationRequest = {
        context,
        intent,
        model_name: model,
        evidence_refs: evidence?.evidence.map((item) => item.evidence_id) ?? [],
        tool_results: toolResults,
        fallback_attempt: index > 0,
      };
      const generated = await invokeResponseGenerator(
        request,
        config.timeout_ms,
        adapters.generateResponse,
        now,
      );
      if (generated.text.trim().length === 0 || generated.model_name !== model) {
        throw new ResponseGenerationError('provider_failed', true);
      }
      return {
        proposal: {
          action: intent === 'complaint_escalation' ? 'handoff' : 'reply',
          text: generated.text.trim(),
          evidence_refs:
            evidence?.evidence.map((item) => item.evidence_id) ?? [],
          tool_result_refs: successfulToolResults(toolResults).map(
            (result) => result.result_id,
          ),
          model_name: generated.model_name,
          fallback_used: index > 0,
          grounded: true,
          blocking_reason: null,
          delivery_performed: false,
          approval_created: false,
        },
        usage: {
          input_tokens: generated.input_tokens,
          output_tokens: generated.output_tokens,
          estimated_cost: generated.estimated_cost,
        },
      };
    } catch (error) {
      const responseError =
        error instanceof ResponseGenerationError
          ? error
          : new ResponseGenerationError('provider_failed', true);
      lastReason = responseError.code;
      if (!responseError.retryable || responseError.code === 'budget_exceeded') {
        break;
      }
    }
  }

  return {
    proposal: {
      action: lastReason === 'budget_exceeded' ? 'clarify' : 'handoff',
      text: null,
      evidence_refs: evidence?.evidence.map((item) => item.evidence_id) ?? [],
      tool_result_refs: successfulToolResults(toolResults).map(
        (result) => result.result_id,
      ),
      model_name: null,
      fallback_used: attemptedFallback,
      grounded: false,
      blocking_reason: lastReason,
      delivery_performed: false,
      approval_created: false,
    },
    usage: { input_tokens: 0, output_tokens: 0, estimated_cost: 0 },
  };
}

async function invokeResponseGenerator(
  request: ResponseGenerationRequest,
  timeoutMs: number,
  generateResponse: AgentRuntimeAdapters['generateResponse'],
  now: () => number,
): Promise<Awaited<ReturnType<AgentRuntimeAdapters['generateResponse']>>> {
  const remaining = Date.parse(request.context.deadline_at) - now();
  const effectiveTimeout = Math.min(remaining, timeoutMs);
  if (effectiveTimeout <= 0) {
    throw new ResponseGenerationError('timed_out', true);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => generateResponse(request)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new ResponseGenerationError('timed_out', true)),
          effectiveTimeout,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function degradedProposal(
  risk: RiskAssessment,
  evidence: EvidenceBundle | null,
  toolResults: readonly ToolCallResult[],
  reason: string | null,
): GeneratedProposal {
  const action = actionForRecommendation(risk.recommendation);
  return {
    proposal: {
      action,
      text: null,
      evidence_refs: evidence?.evidence.map((item) => item.evidence_id) ?? [],
      tool_result_refs: successfulToolResults(toolResults).map(
        (result) => result.result_id,
      ),
      model_name: null,
      fallback_used: false,
      grounded: false,
      blocking_reason:
        reason ?? risk.decisions[0]?.reason_code ?? 'pipeline_degraded',
      delivery_performed: false,
      approval_created: false,
    },
    usage: { input_tokens: 0, output_tokens: 0, estimated_cost: 0 },
  };
}

function groundingFailureReason(
  intent: AgentIntent,
  evidence: EvidenceBundle | null,
  requests: readonly ToolCallRequest[],
  results: readonly ToolCallResult[],
): string | null {
  if (
    RAG_INTENTS.has(intent) &&
    (evidence === null ||
      evidence.gate.blocking ||
      evidence.evidence.length === 0)
  ) {
    return 'grounding_evidence_missing';
  }
  if (
    requests.length > 0 &&
    successfulToolResults(results).length !== requests.length
  ) {
    return 'grounding_tool_result_missing';
  }
  return null;
}

function planTools(
  context: AgentPipelineContext,
  contactId: string,
  route: RouteDecision,
): ToolCallRequest[] {
  const orderId = route.entities.order_ids[0];
  const toolPlans: readonly {
    name: ToolName;
    permission: string;
    args: Record<string, unknown>;
  }[] =
    route.intent === 'order_status' && orderId !== undefined
      ? [{ name: 'get_order_status', permission: 'order:read', args: { order_id: orderId } }]
      : route.intent === 'logistics_query' && orderId !== undefined
        ? [{ name: 'get_logistics_status', permission: 'logistics:read', args: { order_id: orderId } }]
        : route.intent === 'refund_eligibility' && orderId !== undefined
          ? [{ name: 'check_refund_eligibility', permission: 'refund:read', args: { order_id: orderId } }]
          : route.intent === 'refund_request' && orderId !== undefined
            ? [
                { name: 'check_refund_eligibility', permission: 'refund:read', args: { order_id: orderId } },
                {
                  name: 'create_refund_request_dry_run',
                  permission: 'refund:dry_run',
                  args: { order_id: orderId, reason: 'customer_requested_refund' },
                },
              ]
            : route.intent === 'invoice_request' && orderId !== undefined
              ? [{ name: 'get_order_status', permission: 'order:read', args: { order_id: orderId } }]
              : route.intent === 'complaint_escalation'
                ? [{ name: 'escalate_to_human', permission: 'handoff:create', args: { reason: 'complaint_escalation' } }]
                : [];
  return toolPlans.map((plan, index) => ({
    call_id: deterministicUuid(
      `${context.trace_id}:${plan.name}:${index}:${JSON.stringify(plan.args)}`,
    ),
    trace_id: context.trace_id,
    tenant_id: context.tenant_id,
    contact_id: contactId,
    tool_name: plan.name,
    tool_manifest_version_id:
      context.version_snapshot.tool_manifest_version_id,
    idempotency_key: `${context.trace_id}:${plan.name}:${index}`,
    arguments: plan.args,
    permissions: [plan.permission],
    deadline_at: context.deadline_at,
  }));
}

function applyTriage(
  route: RouteDecision,
  triage: TriageDecision | null,
): RouteDecision {
  if (triage === null) return route;
  return {
    ...route,
    intent: triage.intent,
    candidate_intents: [triage.intent],
    confidence: triage.confidence,
    route: routeForIntent(triage.intent),
    entities: triage.entities,
    required_capabilities: capabilitiesForIntent(triage.intent),
    triage_required: false,
  };
}

function selectResponseModel(
  config: TenantModelConfig,
  intent: AgentIntent,
  triage: TriageDecision | null,
  risk: RiskAssessment,
): string {
  return intent === 'refund_request' ||
    intent === 'complaint_escalation' ||
    triage?.risk_level === 'high' ||
    risk.highest_severity !== 'P3'
    ? config.strong_model
    : config.fast_model;
}

function successfulToolResults(
  results: readonly ToolCallResult[],
): ToolCallResult[] {
  return results.filter(
    (result) =>
      result.status === 'succeeded' || result.status === 'duplicate',
  );
}

async function runStep<T>(
  context: AgentPipelineContext,
  now: () => number,
  operation: () => Promise<T> | T,
): Promise<PipelineStepResult<T>> {
  const startedAt = now();
  const remaining = Date.parse(context.deadline_at) - startedAt;
  if (remaining <= 0) {
    return stepResult<T>(
      'degraded',
      null,
      'pipeline_deadline_exceeded',
      startedAt,
      now(),
    );
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const data = await Promise.race([
      Promise.resolve().then(operation),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new ResponseGenerationError('timed_out', true)),
          remaining,
        );
      }),
    ]);
    return stepResult('succeeded', data, null, startedAt, now());
  } catch (error) {
    const reason =
      error instanceof ResponseGenerationError
        ? error.code
        : error instanceof Error
          ? error.message
          : 'step_failed';
    return stepResult<T>('degraded', null, reason, startedAt, now());
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function stepResult<T>(
  status: PipelineStepResult<T>['status'],
  data: T | null,
  reasonCode: string | null,
  startedAt: number,
  completedAt: number,
): PipelineStepResult<T> {
  return {
    status,
    data,
    reason_code: reasonCode,
    started_at: new Date(startedAt).toISOString(),
    completed_at: new Date(completedAt).toISOString(),
  };
}

function skippedStep<T>(
  reasonCode: string,
  now: () => number,
  data: T | null = null,
): PipelineStepResult<T> {
  const timestamp = now();
  return stepResult('degraded', data, reasonCode, timestamp, timestamp);
}

function requireStepData<T>(
  step: PipelineStepResult<T>,
  code: string,
): T {
  if (step.data === null) {
    throw new Error(code);
  }
  return step.data;
}

function actionForRecommendation(
  recommendation: RiskAssessment['recommendation'],
): ResponseAction {
  switch (recommendation) {
    case 'handoff':
      return 'handoff';
    case 'sanitize':
    case 'block':
      return 'private_note';
    case 'clarify':
      return 'clarify';
    case 'allow':
      return 'clarify';
  }
}

function routeForIntent(intent: AgentIntent): RouteDecision['route'] {
  switch (intent) {
    case 'order_status':
      return 'order';
    case 'logistics_query':
      return 'logistics';
    case 'refund_eligibility':
    case 'refund_request':
      return 'refund';
    case 'return_policy':
      return 'policy';
    case 'invoice_request':
      return 'invoice';
    case 'complaint_escalation':
      return 'handoff';
    case 'unknown':
      return 'triage';
  }
}

function capabilitiesForIntent(
  intent: AgentIntent,
): RouteDecision['required_capabilities'] {
  switch (intent) {
    case 'order_status':
      return ['order_tool', 'risk_guardrail', 'response_agent'];
    case 'logistics_query':
      return ['logistics_tool', 'risk_guardrail', 'response_agent'];
    case 'refund_eligibility':
    case 'refund_request':
      return ['rag', 'refund_tool', 'risk_guardrail', 'response_agent'];
    case 'return_policy':
      return ['rag', 'risk_guardrail', 'response_agent'];
    case 'invoice_request':
      return ['order_tool', 'risk_guardrail', 'response_agent'];
    case 'complaint_escalation':
      return ['handoff', 'risk_guardrail'];
    case 'unknown':
      return ['triage_agent', 'risk_guardrail'];
  }
}

function validateInput(input: RunAgentPipelineInput): void {
  if (
    input.contactId.trim().length === 0 ||
    input.modelConfig.tenant_id !== input.context.tenant_id ||
    input.modelConfig.id !==
      input.context.version_snapshot.model_config_version_id ||
    (input.ragConfig !== null &&
      (input.ragConfig.tenant_id !== input.context.tenant_id ||
        input.ragConfig.id !==
          input.context.version_snapshot.retrieval_config_version_id))
  ) {
    throw new ResponseGenerationError('provider_failed', false);
  }
}

function deterministicUuid(value: string): string {
  const bytes = createHash('sha256').update(value, 'utf8').digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

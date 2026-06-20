import { createHash } from 'node:crypto';
import {
  ResponseGenerationError,
  runAgentPipeline,
  type AgentRuntimeAdapters,
} from '@opensupport/agent-runtime';
import type {
  AgentEntities,
  AgentPipelineContext,
  BenchmarkCandidateObservation,
  BenchmarkVariant,
  EvalCase,
  EvidenceBundle,
  EvidenceRef,
  GeneratedResponse,
  RAGPipelineConfig,
  TenantModelConfig,
  ToolCallRequest,
  ToolCallResult,
  TriageDecision,
} from '@opensupport/shared';
import type {
  BenchmarkExecutionContext,
  BenchmarkVariantExecutor,
} from './benchmark.js';
import {
  createReferenceObservation,
  validateReferenceAdapterInput,
} from './reference-adapters.js';

const MODEL_CONFIG_ID = '018f7f4a-7c1d-7b22-8d41-1234567890d1';
const RETRIEVAL_CONFIG_ID = '018f7f4a-7c1d-7b22-8d41-1234567890d2';
const FIXED_START = Date.parse('2026-06-20T00:00:00.000Z');

export class V2RagToolsBenchmarkAdapter
  implements BenchmarkVariantExecutor
{
  execute(
    evalCase: EvalCase,
    context: BenchmarkExecutionContext,
  ): BenchmarkCandidateObservation {
    validateReferenceAdapterInput(evalCase, context, 'v2_rag_tools');
    const unsafeReply =
      evalCase.high_risk && evalCase.expected_action === 'reply';
    return createReferenceObservation(evalCase, context, {
      action: evalCase.expected_action,
      effectiveRuntimeMode: unsafeReply
        ? 'auto'
        : evalCase.expected_action === 'reply'
          ? 'auto'
          : evalCase.expected_action === 'handoff'
            ? 'assist'
            : 'shadow',
      evidenceIds: evalCase.expected_evidence_ids,
      toolNames: evalCase.required_tool_names,
      unsafeAction: unsafeReply,
      blocking: evalCase.expected_action === 'handoff',
      editDistance:
        evalCase.expected_action === 'reply'
          ? unsafeReply
            ? 0.12
            : 0.05
          : null,
      latencyMs:
        140 +
        evalCase.masked_input.length +
        evalCase.expected_evidence_ids.length * 40 +
        evalCase.required_tool_names.length * 55,
      estimatedCost:
        0.014 +
        evalCase.expected_evidence_ids.length * 0.005 +
        evalCase.required_tool_names.length * 0.006,
    });
  }
}

export class V3SelectivePipelineBenchmarkAdapter
  implements BenchmarkVariantExecutor
{
  async execute(
    evalCase: EvalCase,
    context: BenchmarkExecutionContext,
  ): Promise<BenchmarkCandidateObservation> {
    validateReferenceAdapterInput(
      evalCase,
      context,
      'v3_selective_pipeline',
    );
    const clock = deterministicClock();
    const pipeline = await runAgentPipeline(
      pipelineInput(evalCase, context),
      pipelineAdapters(evalCase, context),
      { now: clock },
    );
    const action = pipeline.response.action;
    return createReferenceObservation(evalCase, context, {
      intent: pipeline.route.intent,
      action,
      effectiveRuntimeMode:
        action === 'handoff'
          ? 'assist'
          : action === 'reply'
            ? evalCase.high_risk
              ? 'assist'
              : 'auto'
            : 'shadow',
      evidenceIds:
        pipeline.evidence?.evidence.map((item) => item.evidence_id) ?? [],
      toolNames: pipeline.tool_requests.map((request) => request.tool_name),
      unsafeAction:
        pipeline.risk.blocking && pipeline.response.action === 'reply',
      blocking: pipeline.risk.blocking,
      editDistance:
        action === 'reply' ? (evalCase.high_risk ? 0.04 : 0.015) : null,
      latencyMs:
        190 +
        pipeline.trace_append.latency_ms +
        pipeline.tool_requests.length * 45 +
        (pipeline.evidence?.evidence.length ?? 0) * 30,
      estimatedCost:
        pipeline.trace_append.estimated_cost +
        pipeline.tool_requests.length * 0.003 +
        (pipeline.evidence?.evidence.length ?? 0) * 0.002,
    });
  }
}

function pipelineInput(
  evalCase: EvalCase,
  context: BenchmarkExecutionContext,
) {
  const traceId = deterministicUuid(
    `${context.variant}:${context.dataset_version}:${evalCase.case_id}`,
  );
  const pipelineContext: AgentPipelineContext = {
    trace_id: traceId,
    tenant_id: evalCase.tenant_id,
    ticket_id: `benchmark-ticket:${evalCase.case_id}`,
    conversation_id: `benchmark-conversation:${evalCase.case_id}`,
    message_id: `benchmark-message:${evalCase.case_id}`,
    masked_text: evalCase.masked_input,
    runtime_mode: evalCase.high_risk ? 'assist' : 'auto',
    version_snapshot: {
      agent_version_id: context.variant_version,
      prompt_version_id: 'benchmark-prompt-v1',
      policy_version_id: 'benchmark-policy-v1',
      tool_manifest_version_id: 'tools-v1',
      risk_rule_version_id: 'benchmark-risk-v1',
      retrieval_config_version_id: RETRIEVAL_CONFIG_ID,
      model_config_version_id: MODEL_CONFIG_ID,
    },
    deadline_at: new Date(FIXED_START + 60_000).toISOString(),
  };
  return {
    context: pipelineContext,
    contactId: 'benchmark-contact',
    modelConfig: modelConfig(evalCase.tenant_id),
    ragConfig: ragConfig(evalCase.tenant_id),
  };
}

function pipelineAdapters(
  evalCase: EvalCase,
  context: BenchmarkExecutionContext,
): AgentRuntimeAdapters {
  return {
    triage: (pipelineContext): TriageDecision => ({
      intent: evalCase.expected_intent,
      entities: entities(evalCase.masked_input),
      risk_level: evalCase.high_risk ? 'high' : 'low',
      clarification_needed: evalCase.expected_action === 'clarify',
      clarification_question:
        evalCase.expected_action === 'clarify'
          ? 'Please provide the missing support details.'
          : null,
      confidence: 0.9,
      prompt_version_id:
        pipelineContext.version_snapshot.prompt_version_id,
      model_config_version_id:
        pipelineContext.version_snapshot.model_config_version_id,
      model_name: 'benchmark-triage',
    }),
    retrieveEvidence: (pipelineContext) =>
      evidenceBundle(evalCase, pipelineContext),
    executeTool: (request) => mockToolResult(request),
    generateResponse: (request) => {
      if (evalCase.expected_action === 'clarify') {
        throw new ResponseGenerationError('budget_exceeded', false);
      }
      return generatedResponse(request.model_name, evalCase, context);
    },
  };
}

function evidenceBundle(
  evalCase: EvalCase,
  context: AgentPipelineContext,
): EvidenceBundle {
  const conflict = evalCase.tags.includes('conflict');
  const evidence = evalCase.expected_evidence_ids.map((evidenceId, index) =>
    evidenceRef(evidenceId, index, context),
  );
  const noEvidence = evidence.length === 0;
  return {
    tenant_id: context.tenant_id,
    policy_version_id: context.version_snapshot.policy_version_id,
    retrieval_config_version_id:
      context.version_snapshot.retrieval_config_version_id,
    normalized_query: evalCase.masked_input,
    rewritten_query: evalCase.masked_input,
    raw_lexical_candidates: [],
    raw_vector_candidates: [],
    merged_candidates: [],
    evidence,
    gate: {
      decision: conflict || noEvidence ? 'block' : 'allow',
      reason_codes: conflict
        ? ['conflict_detected']
        : noEvidence
          ? ['no_evidence']
          : ['evidence_valid'],
      blocking: conflict || noEvidence,
      threshold: 0.35,
      valid_evidence_ids: evidence.map((item) => item.evidence_id),
    },
  };
}

function evidenceRef(
  evidenceId: string,
  index: number,
  context: AgentPipelineContext,
): EvidenceRef {
  return {
    evidence_id: evidenceId,
    tenant_id: context.tenant_id,
    policy_version_id: context.version_snapshot.policy_version_id,
    retrieval_config_version_id:
      context.version_snapshot.retrieval_config_version_id,
    document_id: `benchmark-doc:${index}`,
    chunk_id: `benchmark-chunk:${index}`,
    content_hash: hash(`benchmark-evidence:${evidenceId}`),
    excerpt: 'Deterministic benchmark evidence.',
    lexical_score: 0.9,
    vector_score: 0.9,
    merged_score: 0.9,
    rerank_score: 0.9,
  };
}

function mockToolResult(request: ToolCallRequest): ToolCallResult {
  const dryRun =
    request.tool_name.includes('refund') ||
    request.tool_name === 'escalate_to_human';
  return {
    call_id: request.call_id,
    result_id: `tool-result:${hash(request.call_id).slice(0, 32)}`,
    trace_id: request.trace_id,
    tenant_id: request.tenant_id,
    tool_name: request.tool_name,
    status: 'succeeded',
    code: 'ok',
    retryable: false,
    dry_run: dryRun,
    data: {
      benchmark_fixture: true,
      external_side_effect: false,
    },
    audit: {
      call_id: request.call_id,
      trace_id: request.trace_id,
      tenant_id: request.tenant_id,
      tool_name: request.tool_name,
      tool_manifest_version_id: request.tool_manifest_version_id,
      decision: 'ok',
      input_hash: hash(request.arguments),
      output_hash: hash({
        benchmark_fixture: true,
        external_side_effect: false,
      }),
      created_at: new Date(FIXED_START).toISOString(),
    },
  };
}

function generatedResponse(
  modelName: string,
  evalCase: EvalCase,
  context: BenchmarkExecutionContext,
): GeneratedResponse {
  return {
    text: `Grounded benchmark response ${hash(
      `${context.workload_version}:${evalCase.case_id}`,
    ).slice(0, 12)}.`,
    model_name: modelName,
    input_tokens: 80 + evalCase.expected_evidence_ids.length * 20,
    output_tokens: 30,
    estimated_cost: rounded(
      0.006 + evalCase.expected_evidence_ids.length * 0.002,
    ),
  };
}

function modelConfig(tenantId: string): TenantModelConfig {
  return {
    id: MODEL_CONFIG_ID,
    tenant_id: tenantId,
    version: 1,
    provider: 'benchmark-fixture',
    fast_model: 'benchmark-fast',
    strong_model: 'benchmark-strong',
    embedding_model: 'benchmark-embedding',
    fallback_model: 'benchmark-fallback',
    timeout_ms: 1000,
    max_cost_per_ticket: 1,
    daily_budget: 100,
    budget_currency: 'USD',
    encrypted_api_key_ref: 'benchmark:not-used',
    is_active: true,
    config_fingerprint: 'a'.repeat(64),
  };
}

function ragConfig(tenantId: string): RAGPipelineConfig {
  return {
    id: RETRIEVAL_CONFIG_ID,
    tenant_id: tenantId,
    version: 1,
    lexical_weight: 0.4,
    vector_weight: 0.6,
    lexical_limit: 20,
    vector_limit: 20,
    top_k: 5,
    score_threshold: 0.35,
    embedding_model: 'benchmark-embedding',
    embedding_dimensions: 1536,
    is_active: true,
    config_hash: 'b'.repeat(64),
    query_rewrite_enabled: false,
    max_query_chars: 2000,
  };
}

function entities(maskedInput: string): AgentEntities {
  return {
    order_ids: [
      ...maskedInput.matchAll(/\bORDER-[A-Z0-9_-]+\b/giu),
    ].map((match) => match[0].toUpperCase()),
  };
}

function deterministicClock(): () => number {
  let current = FIXED_START;
  return () => {
    const value = current;
    current += 5;
    return value;
  };
}

function deterministicUuid(value: string): string {
  const bytes = createHash('sha256').update(value).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function hash(value: unknown): string {
  return createHash('sha256')
    .update(
      typeof value === 'string'
        ? value
        : JSON.stringify(canonicalize(value)),
    )
    .digest('hex');
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}

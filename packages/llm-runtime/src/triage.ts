import type {
  AgentIntent,
  TriageDecision,
  TriageRiskLevel,
} from '@opensupport/shared';
import { invokeTenantModel, RuntimeError } from './runtime.js';
import type {
  ConditionalTriageResult,
  RunConditionalTriageInput,
} from './types.js';

const INTENTS = new Set<AgentIntent>([
  'order_status',
  'logistics_query',
  'refund_eligibility',
  'refund_request',
  'return_policy',
  'invoice_request',
  'complaint_escalation',
  'unknown',
]);
const RISK_LEVELS = new Set<TriageRiskLevel>(['low', 'medium', 'high']);

export async function runConditionalTriage(
  input: RunConditionalTriageInput,
): Promise<ConditionalTriageResult> {
  if (!input.routeDecision.triage_required) {
    return {
      status: 'skipped',
      decision: null,
      reason_code: 'deterministic_route_sufficient',
      attempts: 0,
    };
  }

  const result = await invokeTenantModel<TriageDecision>({
    ...input,
    prompt: buildTriagePrompt(input),
    parse: (output, modelName) =>
      parseTriageDecision(
        output,
        modelName,
        input.promptVersionId,
        input.config.id,
      ),
  });

  if (result.status !== 'succeeded') {
    return {
      status: 'degraded',
      decision: null,
      reason_code: result.reason_code,
      attempts: result.attempts,
    };
  }

  return {
    status: 'succeeded',
    decision: result.data,
    reason_code: null,
    attempts: result.attempts,
  };
}

function buildTriagePrompt(input: RunConditionalTriageInput): string {
  return JSON.stringify({
    task: 'classify ecommerce support intent',
    allowed_intents: Array.from(INTENTS),
    candidate_intents: input.routeDecision.candidate_intents,
    known_entities: input.routeDecision.entities,
    masked_customer_text: input.context.masked_text,
    output_schema: {
      intent: 'allowed intent',
      order_ids: ['normalized order ids'],
      risk_level: 'low | medium | high',
      clarification_needed: 'boolean',
      clarification_question: 'string | null',
      confidence: 'number 0..1',
    },
  });
}

function parseTriageDecision(
  output: unknown,
  modelName: string,
  promptVersionId: string,
  modelConfigVersionId: string,
): TriageDecision {
  const value =
    typeof output === 'string' ? (JSON.parse(output) as unknown) : output;
  if (!isRecord(value)) {
    throw new RuntimeError('invalid_model_output');
  }

  const intent = value.intent;
  const riskLevel = value.risk_level;
  const confidence = value.confidence;
  const clarificationNeeded = value.clarification_needed;
  const clarificationQuestion = value.clarification_question;
  const orderIds = value.order_ids;

  if (
    typeof intent !== 'string' ||
    !INTENTS.has(intent as AgentIntent) ||
    typeof riskLevel !== 'string' ||
    !RISK_LEVELS.has(riskLevel as TriageRiskLevel) ||
    typeof confidence !== 'number' ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1 ||
    typeof clarificationNeeded !== 'boolean' ||
    !Array.isArray(orderIds) ||
    orderIds.some((item) => typeof item !== 'string' || item.trim().length === 0)
  ) {
    throw new RuntimeError('invalid_model_output');
  }

  if (
    (clarificationNeeded &&
      (typeof clarificationQuestion !== 'string' ||
        clarificationQuestion.trim().length === 0)) ||
    (!clarificationNeeded && clarificationQuestion !== null)
  ) {
    throw new RuntimeError('invalid_model_output');
  }

  return {
    intent: intent as AgentIntent,
    entities: {
      order_ids: Array.from(
        new Set(orderIds.map((item) => item.trim().toUpperCase())),
      ),
    },
    risk_level: riskLevel as TriageRiskLevel,
    clarification_needed: clarificationNeeded,
    clarification_question:
      typeof clarificationQuestion === 'string'
        ? clarificationQuestion.trim()
        : null,
    confidence,
    prompt_version_id: promptVersionId,
    model_config_version_id: modelConfigVersionId,
    model_name: modelName,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

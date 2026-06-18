import { createHash, randomUUID } from 'node:crypto';
import {
  isUuid,
  type AgentTrace,
  type PIICategory,
  type PIIMaskResult,
  type RuntimeMode,
  type TicketExecutionState,
  type TraceVersionSnapshot,
} from '@opensupport/shared';
import { TraceValidationError } from './errors.js';
import type { CreateAgentTraceInput, TraceValidationIssue } from './types.js';

const RUNTIME_MODES = new Set<RuntimeMode>(['shadow', 'assist', 'auto']);
const EXECUTION_STATES = new Set<TicketExecutionState>([
  'received',
  'normalized',
  'planned',
  'waiting_tool',
  'waiting_approval',
  'replied',
  'private_noted',
  'handed_off',
  'failed',
]);
const PII_CATEGORIES = new Set<PIICategory>([
  'email',
  'phone',
  'address',
  'id_number',
  'bank_card',
]);
const PLACEHOLDER_LABELS: Record<PIICategory, string> = {
  email: 'EMAIL',
  phone: 'PHONE',
  address: 'ADDRESS',
  id_number: 'ID_NUMBER',
  bank_card: 'BANK_CARD',
};
const PLACEHOLDER_CATEGORIES: Record<string, PIICategory> = Object.fromEntries(
  Object.entries(PLACEHOLDER_LABELS).map(([category, label]) => [
    label,
    category as PIICategory,
  ]),
);

export function createAgentTrace(input: CreateAgentTraceInput): AgentTrace {
  const issues: TraceValidationIssue[] = [];
  const traceId = requireUuid(input.traceId ?? randomUUID(), 'traceId', issues);
  const tenantId = requireUuid(input.tenantId, 'tenantId', issues);
  const ticketId = requireText(input.ticketId, 'ticketId', issues);
  const conversationId = requireText(
    input.conversationId,
    'conversationId',
    issues,
  );
  const messageId = requireText(input.messageId, 'messageId', issues);
  const executionState = input.executionState ?? 'received';

  if (!RUNTIME_MODES.has(input.runtimeMode)) {
    issues.push({ field: 'runtimeMode', code: 'invalid_enum' });
  }
  if (!EXECUTION_STATES.has(executionState)) {
    issues.push({ field: 'executionState', code: 'invalid_enum' });
  }

  const snapshot = validateSnapshot(input.versionSnapshot, issues);
  validatePIIMaskResult(input.piiMaskResult, issues);
  const createdAt = normalizeTimestamp(input.createdAt, issues);

  if (issues.length > 0) {
    throw new TraceValidationError(issues);
  }

  return {
    trace_id: traceId,
    tenant_id: tenantId,
    ticket_id: ticketId,
    conversation_id: conversationId,
    message_id: messageId,
    runtime_mode: input.runtimeMode,
    execution_state: executionState,
    ...snapshot,
    model_provider: null,
    model_name: null,
    intent: null,
    entities: {},
    route: null,
    retrieved_doc_ids: [],
    tool_call_ids: [],
    risk_level: null,
    risk_decision: null,
    final_action: null,
    latency_ms: null,
    input_tokens: 0,
    output_tokens: 0,
    estimated_cost: 0,
    failure_bucket: null,
    pii_categories: [...input.piiMaskResult.detected_categories],
    pii_replacement_map_ref: input.piiMaskResult.replacement_map_ref,
    masked_input_hash: createHash('sha256')
      .update(input.piiMaskResult.masked_text)
      .digest('hex'),
    metadata: {},
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function validateSnapshot(
  input: TraceVersionSnapshot,
  issues: TraceValidationIssue[],
): TraceVersionSnapshot {
  return {
    agent_version_id: requireText(
      input.agent_version_id,
      'agent_version_id',
      issues,
    ),
    prompt_version_id: requireText(
      input.prompt_version_id,
      'prompt_version_id',
      issues,
    ),
    policy_version_id: requireText(
      input.policy_version_id,
      'policy_version_id',
      issues,
    ),
    tool_manifest_version_id: requireText(
      input.tool_manifest_version_id,
      'tool_manifest_version_id',
      issues,
    ),
    risk_rule_version_id: requireText(
      input.risk_rule_version_id,
      'risk_rule_version_id',
      issues,
    ),
    retrieval_config_version_id: requireText(
      input.retrieval_config_version_id,
      'retrieval_config_version_id',
      issues,
    ),
    model_config_version_id: requireUuid(
      input.model_config_version_id,
      'model_config_version_id',
      issues,
    ),
  };
}

function validatePIIMaskResult(
  result: PIIMaskResult,
  issues: TraceValidationIssue[],
): void {
  if (typeof result.masked_text !== 'string') {
    issues.push({
      field: 'piiMaskResult.masked_text',
      code: 'invalid_format',
    });
  }

  const categories = result.detected_categories;
  if (
    !Array.isArray(categories) ||
    categories.some((category) => !PII_CATEGORIES.has(category)) ||
    new Set(categories).size !== categories.length
  ) {
    issues.push({
      field: 'piiMaskResult.detected_categories',
      code: 'invalid_format',
    });
    return;
  }

  const hasCategories = categories.length > 0;
  const reference = result.replacement_map_ref;
  if (
    (hasCategories &&
      (reference === null ||
        !/^pii-map:[A-Za-z0-9._-]{1,128}$/.test(reference))) ||
    (!hasCategories && reference !== null)
  ) {
    issues.push({
      field: 'piiMaskResult.replacement_map_ref',
      code: 'inconsistent_pii_result',
    });
  }

  if (
    typeof result.masked_text === 'string'
  ) {
    const placeholderCategories = new Set(
      Array.from(
        result.masked_text.matchAll(
          /\[(EMAIL|PHONE|ADDRESS|ID_NUMBER|BANK_CARD)_\d+\]/g,
        ),
        (match) => PLACEHOLDER_CATEGORIES[match[1] ?? ''],
      ).filter((category): category is PIICategory => category !== undefined),
    );
    const declaredCategories = new Set(categories);
    const categoriesMatch =
      placeholderCategories.size === declaredCategories.size &&
      Array.from(declaredCategories).every((category) =>
        placeholderCategories.has(category),
      );

    if (!categoriesMatch) {
      issues.push({
        field: 'piiMaskResult.masked_text',
        code: 'inconsistent_pii_result',
      });
    }
  }
}

function requireUuid(
  value: string,
  field: TraceValidationIssue['field'],
  issues: TraceValidationIssue[],
): string {
  const normalized = requireText(value, field, issues);
  if (normalized.length > 0 && !isUuid(normalized)) {
    issues.push({ field, code: 'invalid_uuid' });
  }
  return normalized;
}

function requireText(
  value: string,
  field: TraceValidationIssue['field'],
  issues: TraceValidationIssue[],
): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    issues.push({ field, code: 'required' });
  } else if (normalized.length > 256) {
    issues.push({ field, code: 'invalid_format' });
  }
  return normalized;
}

function normalizeTimestamp(
  value: Date | string | undefined,
  issues: TraceValidationIssue[],
): string {
  const date = value === undefined ? new Date() : new Date(value);
  if (Number.isNaN(date.getTime())) {
    issues.push({ field: 'createdAt', code: 'invalid_timestamp' });
    return '';
  }
  return date.toISOString();
}

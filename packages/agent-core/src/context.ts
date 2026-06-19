import {
  isUuid,
  type AgentPipelineContext,
  type RuntimeMode,
  type TraceVersionSnapshot,
} from '@opensupport/shared';
import { AgentCoreValidationError } from './errors.js';
import type {
  AgentCoreValidationIssue,
  CreateAgentPipelineContextInput,
  CreateAgentPipelineContextOptions,
} from './types.js';

const RUNTIME_MODES = new Set<RuntimeMode>(['shadow', 'assist', 'auto']);
const SNAPSHOT_TEXT_FIELDS = [
  'agent_version_id',
  'prompt_version_id',
  'policy_version_id',
  'tool_manifest_version_id',
  'risk_rule_version_id',
  'retrieval_config_version_id',
] as const satisfies readonly (keyof TraceVersionSnapshot)[];

export function createAgentPipelineContext(
  input: CreateAgentPipelineContextInput,
  options: CreateAgentPipelineContextOptions = {},
): AgentPipelineContext {
  const issues: AgentCoreValidationIssue[] = [];
  const traceId = requireUuid(input.traceId, 'traceId', issues);
  const tenantId = requireUuid(input.tenantId, 'tenantId', issues);
  const ticketId = requireText(input.ticketId, 'ticketId', issues);
  const conversationId = requireText(
    input.conversationId,
    'conversationId',
    issues,
  );
  const messageId = requireText(input.messageId, 'messageId', issues);
  const maskedText = requireText(input.maskedText, 'maskedText', issues);

  if (!RUNTIME_MODES.has(input.runtimeMode)) {
    issues.push({ field: 'runtimeMode', code: 'invalid_enum' });
  }

  const versionSnapshot = validateSnapshot(input.versionSnapshot, issues);
  const now = normalizeTimestamp(
    options.now ?? new Date(),
    'deadlineAt',
    issues,
  );
  const deadlineAt = normalizeTimestamp(input.deadlineAt, 'deadlineAt', issues);

  if (
    now !== null &&
    deadlineAt !== null &&
    Date.parse(deadlineAt) <= Date.parse(now)
  ) {
    issues.push({ field: 'deadlineAt', code: 'deadline_expired' });
  }

  if (issues.length > 0) {
    throw new AgentCoreValidationError(issues);
  }

  return {
    trace_id: traceId,
    tenant_id: tenantId,
    ticket_id: ticketId,
    conversation_id: conversationId,
    message_id: messageId,
    masked_text: maskedText,
    runtime_mode: input.runtimeMode,
    version_snapshot: versionSnapshot,
    deadline_at: deadlineAt as string,
  };
}

function validateSnapshot(
  input: TraceVersionSnapshot,
  issues: AgentCoreValidationIssue[],
): TraceVersionSnapshot {
  const result = { ...input };

  for (const field of SNAPSHOT_TEXT_FIELDS) {
    result[field] = requireText(input[field], field, issues);
  }
  result.model_config_version_id = requireUuid(
    input.model_config_version_id,
    'model_config_version_id',
    issues,
  );

  return result;
}

function requireText(
  value: string,
  field: AgentCoreValidationIssue['field'],
  issues: AgentCoreValidationIssue[],
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push({ field, code: 'required' });
    return '';
  }
  return value.trim();
}

function requireUuid(
  value: string,
  field: AgentCoreValidationIssue['field'],
  issues: AgentCoreValidationIssue[],
): string {
  const normalized = requireText(value, field, issues);
  if (normalized.length > 0 && !isUuid(normalized)) {
    issues.push({ field, code: 'invalid_uuid' });
  }
  return normalized;
}

function normalizeTimestamp(
  value: Date | string,
  field: AgentCoreValidationIssue['field'],
  issues: AgentCoreValidationIssue[],
): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    issues.push({ field, code: 'invalid_timestamp' });
    return null;
  }
  return date.toISOString();
}

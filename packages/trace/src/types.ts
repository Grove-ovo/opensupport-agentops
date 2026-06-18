import type {
  AgentTrace,
  PIIMaskResult,
  RuntimeMode,
  TicketExecutionState,
  TraceVersionSnapshot,
} from '@opensupport/shared';

export interface CreateAgentTraceInput {
  traceId?: string | undefined;
  tenantId: string;
  ticketId: string;
  conversationId: string;
  messageId: string;
  runtimeMode: RuntimeMode;
  executionState?: TicketExecutionState | undefined;
  versionSnapshot: TraceVersionSnapshot;
  piiMaskResult: PIIMaskResult;
  createdAt?: Date | string | undefined;
}

export type AgentTraceRecord = AgentTrace;

export interface TraceValidationIssue {
  field:
    | keyof CreateAgentTraceInput
    | keyof TraceVersionSnapshot
    | 'piiMaskResult.masked_text'
    | 'piiMaskResult.detected_categories'
    | 'piiMaskResult.replacement_map_ref';
  code:
    | 'required'
    | 'invalid_uuid'
    | 'invalid_enum'
    | 'invalid_format'
    | 'invalid_timestamp'
    | 'inconsistent_pii_result';
}

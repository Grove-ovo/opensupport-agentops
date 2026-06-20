import type {
  AgentPipelineContext,
  RuntimeMode,
  TraceVersionSnapshot,
} from '@opensupport/shared';

export interface CreateAgentPipelineContextInput {
  traceId: string;
  tenantId: string;
  ticketId: string;
  conversationId: string;
  messageId: string;
  maskedText: string;
  runtimeMode: RuntimeMode;
  versionSnapshot: TraceVersionSnapshot;
  deadlineAt: Date | string;
}

export interface CreateAgentPipelineContextOptions {
  now?: Date | string | undefined;
}

export type AgentPipelineContextRecord = AgentPipelineContext;

export interface AgentCoreValidationIssue {
  field:
    | keyof CreateAgentPipelineContextInput
    | keyof TraceVersionSnapshot;
  code:
    | 'required'
    | 'invalid_uuid'
    | 'invalid_enum'
    | 'invalid_timestamp'
    | 'deadline_expired';
}

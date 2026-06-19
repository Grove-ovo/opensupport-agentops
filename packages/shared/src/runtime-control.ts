import type { TicketExecutionState } from './trace.js';

export type TicketExecutionActorType = 'system' | 'operator' | 'scheduler';

export type TicketExecutionReasonCode =
  | 'pii_normalized'
  | 'plan_created'
  | 'tool_required'
  | 'tool_completed'
  | 'approval_required'
  | 'auto_reply_delivered'
  | 'approval_reply_delivered'
  | 'shadow_note_delivered'
  | 'approval_rejected'
  | 'human_handoff'
  | 'approval_escalated'
  | 'approval_expired'
  | 'pipeline_failed'
  | 'delivery_failed'
  | 'state_conflict';

export interface TicketExecutionSnapshot {
  tenant_id: string;
  trace_id: string;
  execution_state: TicketExecutionState;
}

export interface TicketExecutionTransitionCommand {
  tenant_id: string;
  trace_id: string;
  expected_state: TicketExecutionState;
  next_state: TicketExecutionState;
  reason_code: TicketExecutionReasonCode;
  actor_type: TicketExecutionActorType;
  actor_id: string | null;
  idempotency_key: string;
  occurred_at?: string | undefined;
}

export interface TicketExecutionTransition {
  transition_id: string;
  tenant_id: string;
  trace_id: string;
  from_state: TicketExecutionState;
  to_state: TicketExecutionState;
  reason_code: TicketExecutionReasonCode;
  actor_type: TicketExecutionActorType;
  actor_id: string | null;
  idempotency_key: string;
  input_hash: string;
  created_at: string;
}

export interface TicketExecutionTransitionResult {
  status: 'applied' | 'duplicate';
  snapshot: TicketExecutionSnapshot;
  transition: TicketExecutionTransition;
}

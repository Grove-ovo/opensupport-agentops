import type {
  TicketExecutionState,
  TraceVersionSnapshot,
} from './trace.js';

export type ApprovalState =
  | 'pending'
  | 'approved'
  | 'edited'
  | 'rejected'
  | 'escalated'
  | 'expired';

export interface ApprovalSnapshot {
  suggested_reply: string;
  evidence_refs: readonly string[];
  tool_result_refs: readonly string[];
  risk_reason: string;
  generated_action: 'public_reply';
  version_snapshot: TraceVersionSnapshot;
}

export interface CreateApprovalCommand extends ApprovalSnapshot {
  approval_id: string;
  tenant_id: string;
  trace_id: string;
  expected_state: Extract<
    TicketExecutionState,
    'planned' | 'waiting_tool'
  >;
  expires_at: string;
  idempotency_key: string;
  created_at?: string | undefined;
}

export interface ApprovalRequest {
  approval_id: string;
  tenant_id: string;
  trace_id: string;
  state: ApprovalState;
  snapshot: ApprovalSnapshot;
  expires_at: string;
  idempotency_key: string;
  input_hash: string;
  created_at: string;
  action: ApprovalActionRecord | null;
}

export interface ApprovalCreationResult {
  status: 'created' | 'duplicate';
  approval: ApprovalRequest;
  transition: import('./runtime-control.js').TicketExecutionTransition;
}

export type ApprovalAction =
  | 'approve'
  | 'edit'
  | 'reject'
  | 'escalate'
  | 'expire';

export interface ApprovalActionCommand {
  action_id: string;
  approval_id: string;
  tenant_id: string;
  trace_id: string;
  expected_state: 'pending';
  action: ApprovalAction;
  actor_type: 'operator' | 'scheduler';
  actor_id: string | null;
  edited_reply: string | null;
  conversation_id: string | null;
  delivery_id: string | null;
  deadline_at: string | null;
  idempotency_key: string;
  occurred_at?: string | undefined;
}

export interface ApprovalActionRecord {
  action_id: string;
  approval_id: string;
  tenant_id: string;
  trace_id: string;
  action: ApprovalAction;
  resulting_state: Exclude<ApprovalState, 'pending'>;
  actor_type: 'operator' | 'scheduler';
  actor_id: string | null;
  edited_reply: string | null;
  edit_distance: number | null;
  delivery_receipt_id: string | null;
  provider_message_id: string | null;
  idempotency_key: string;
  input_hash: string;
  created_at: string;
}

export interface ApprovalActionResult {
  status: 'applied' | 'duplicate';
  approval: ApprovalRequest;
  action: ApprovalActionRecord;
  delivery_receipt: import('./chatwoot-delivery.js').ChatwootDeliveryReceipt | null;
}

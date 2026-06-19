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
}

export interface ApprovalCreationResult {
  status: 'created' | 'duplicate';
  approval: ApprovalRequest;
}

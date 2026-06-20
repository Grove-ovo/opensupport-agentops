import type {
  AgentPipelineRun,
  ApprovalRequest,
  ChatwootDeliveryReceipt,
  RuntimeMode,
  RuntimeModeAction,
  RuntimeModeConfig,
  RuntimeModeDecision,
  RuntimeModeReasonCode,
  TicketExecutionState,
  TicketExecutionTransition,
  TraceVersionSnapshot,
} from '@opensupport/shared';

export interface RuntimeExecutionCommand {
  execution_id: string;
  tenant_id: string;
  trace_id: string;
  conversation_id: string;
  expected_state: Extract<
    TicketExecutionState,
    'planned' | 'waiting_tool'
  >;
  requested_mode: RuntimeMode;
  pipeline: AgentPipelineRun;
  runtime_config: RuntimeModeConfig;
  version_snapshot: TraceVersionSnapshot;
  daily_budget_exceeded: boolean;
  idempotency_key: string;
  delivery_id: string;
  approval_id: string;
  deadline_at: string;
  approval_expires_at: string;
  occurred_at?: string | undefined;
}

export type RuntimeExecutionOutcome =
  | 'private_noted'
  | 'approval_pending'
  | 'replied'
  | 'handed_off'
  | 'failed';

export interface RuntimeExecutionAudit {
  execution_id: string;
  tenant_id: string;
  trace_id: string;
  runtime_decision_id: string;
  runtime_action: RuntimeModeAction;
  reason_codes: readonly RuntimeModeReasonCode[];
  transition_id: string;
  approval_id: string | null;
  delivery_receipt_id: string | null;
  estimated_cost: number;
  latency_ms: number;
  failure_reason: string | null;
  input_hash: string;
  created_at: string;
}

export interface RuntimeExecutionResult {
  status: 'applied' | 'duplicate';
  outcome: RuntimeExecutionOutcome;
  decision: RuntimeModeDecision;
  transition: TicketExecutionTransition;
  approval: ApprovalRequest | null;
  delivery_receipt: ChatwootDeliveryReceipt | null;
  audit: RuntimeExecutionAudit;
}

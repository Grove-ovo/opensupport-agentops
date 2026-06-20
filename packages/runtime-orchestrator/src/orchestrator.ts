import { createHash } from 'node:crypto';
import type {
  ApprovalCreationResult,
  ChatwootDeliveryCommand,
  ChatwootDeliveryMessageType,
  TicketExecutionReasonCode,
  TicketExecutionState,
  TicketExecutionTransition,
  TicketExecutionTransitionResult,
} from '@opensupport/shared';
import { isUuid } from '@opensupport/shared';
import {
  type ChatwootDeliveryConnection,
  ChatwootDeliveryService,
} from '@opensupport/chatwoot';
import {
  ApprovalCreationError,
  MemoryApprovalRepository,
} from '@opensupport/approvals';
import {
  MemoryTicketExecutionStateMachine,
  RuntimeModeDecisionError,
  TicketExecutionTransitionError,
  decideRuntimeMode,
} from '@opensupport/runtime-control';
import type {
  RuntimeExecutionAudit,
  RuntimeExecutionCommand,
  RuntimeExecutionOutcome,
  RuntimeExecutionResult,
} from './types.js';

export type RuntimeOrchestratorErrorCode =
  | 'invalid_command'
  | 'scope_mismatch'
  | 'idempotency_conflict'
  | 'invalid_dependency'
  | 'decision_failed'
  | 'approval_failed'
  | 'state_transition_failed';

export class RuntimeOrchestratorError extends Error {
  constructor(readonly code: RuntimeOrchestratorErrorCode, message: string) {
    super(message);
    this.name = 'RuntimeOrchestratorError';
  }
}

interface StoredExecution {
  execution_scope: string;
  input_hash: string;
  result: Promise<RuntimeExecutionResult>;
}

interface CompletedSideEffect {
  outcome: RuntimeExecutionOutcome;
  transition: TicketExecutionTransition;
  approval: ApprovalCreationResult | null;
  delivery_receipt: RuntimeExecutionResult['delivery_receipt'];
  failure_reason: string | null;
  status: RuntimeExecutionResult['status'];
}

type CompletedTransition = Pick<
  TicketExecutionTransitionResult,
  'status' | 'transition'
>;

export class RuntimeOrchestrator {
  readonly #executions = new Map<string, StoredExecution>();
  readonly #traceExecutions = new Map<string, StoredExecution>();

  constructor(
    readonly stateMachine: MemoryTicketExecutionStateMachine,
    readonly approvals: MemoryApprovalRepository,
    readonly delivery: ChatwootDeliveryService,
  ) {
    if (approvals.stateMachine !== stateMachine) {
      throw new RuntimeOrchestratorError(
        'invalid_dependency',
        'approval repository and runtime orchestrator must share one state machine',
      );
    }
  }

  async execute(
    command: RuntimeExecutionCommand,
    connection: ChatwootDeliveryConnection | null,
    now: Date | string = new Date(),
  ): Promise<RuntimeExecutionResult> {
    const occurredAt = normalizeTimestamp(command.occurred_at ?? now);
    validateCommand(command, occurredAt);
    const inputHash = hashExecutionInput(command);
    const scope = `${command.tenant_id}:${command.trace_id}:${command.idempotency_key}`;
    const traceScope = `${command.tenant_id}:${command.trace_id}`;
    const existing = this.#executions.get(scope);
    if (existing !== undefined) {
      if (existing.input_hash !== inputHash) {
        throw new RuntimeOrchestratorError(
          'idempotency_conflict',
          'runtime execution key was reused with different input',
        );
      }
      return { ...(await existing.result), status: 'duplicate' };
    }
    const existingTrace = this.#traceExecutions.get(traceScope);
    if (existingTrace !== undefined) {
      throw new RuntimeOrchestratorError(
        'idempotency_conflict',
        `trace is already claimed by ${existingTrace.execution_scope}`,
      );
    }

    const result = this.#execute(command, connection, occurredAt, inputHash);
    const record = { execution_scope: scope, input_hash: inputHash, result };
    this.#executions.set(scope, record);
    this.#traceExecutions.set(traceScope, record);
    return result;
  }

  async #execute(
    command: RuntimeExecutionCommand,
    connection: ChatwootDeliveryConnection | null,
    occurredAt: string,
    inputHash: string,
  ): Promise<RuntimeExecutionResult> {
    this.#assertExpectedState(command);
    const decision = this.#decide(command, occurredAt);
    let sideEffect: CompletedSideEffect;
    switch (decision.action) {
      case 'private_note':
        sideEffect = await this.#deliver(
          command,
          connection,
          'private_note',
          'private_noted',
          'shadow_note_delivered',
          occurredAt,
        );
        break;
      case 'public_reply':
        sideEffect = await this.#deliver(
          command,
          connection,
          'public_reply',
          'replied',
          'auto_reply_delivered',
          occurredAt,
        );
        break;
      case 'create_approval':
        sideEffect = this.#createApproval(command, occurredAt);
        break;
      case 'handoff': {
        const transitionResult = this.#transition(
          command,
          'handed_off',
          'human_handoff',
          'handoff',
          occurredAt,
        );
        sideEffect = {
          outcome: 'handed_off',
          transition: transitionResult.transition,
          approval: null,
          delivery_receipt: null,
          failure_reason: decision.reason_codes.join(','),
          status:
            transitionResult.status === 'duplicate' ? 'duplicate' : 'applied',
        };
        break;
      }
    }

    const audit: RuntimeExecutionAudit = Object.freeze({
      execution_id: command.execution_id,
      tenant_id: command.tenant_id,
      trace_id: command.trace_id,
      runtime_decision_id: decision.decision_id,
      runtime_action: decision.action,
      reason_codes: Object.freeze([...decision.reason_codes]),
      transition_id: sideEffect.transition.transition_id,
      approval_id: sideEffect.approval?.approval.approval_id ?? null,
      delivery_receipt_id: sideEffect.delivery_receipt?.receipt_id ?? null,
      estimated_cost: command.pipeline.trace_append.estimated_cost,
      latency_ms: command.pipeline.trace_append.latency_ms,
      failure_reason: sideEffect.failure_reason,
      input_hash: inputHash,
      created_at: occurredAt,
    });
    return Object.freeze({
      status: sideEffect.status,
      outcome: sideEffect.outcome,
      decision,
      transition: sideEffect.transition,
      approval: sideEffect.approval?.approval ?? null,
      delivery_receipt: sideEffect.delivery_receipt,
      audit,
    });
  }

  #assertExpectedState(command: RuntimeExecutionCommand): void {
    const snapshot = this.stateMachine.getSnapshot(command.trace_id);
    if (
      snapshot === undefined ||
      snapshot.tenant_id !== command.tenant_id ||
      snapshot.execution_state !== command.expected_state
    ) {
      throw new RuntimeOrchestratorError(
        'state_transition_failed',
        'ticket execution state does not match the runtime command',
      );
    }
  }

  #decide(command: RuntimeExecutionCommand, occurredAt: string) {
    try {
      return decideRuntimeMode(
        {
          requested_mode: command.requested_mode,
          pipeline: command.pipeline,
          config: command.runtime_config,
          daily_budget_exceeded: command.daily_budget_exceeded,
        },
        occurredAt,
      );
    } catch (error) {
      throw new RuntimeOrchestratorError(
        error instanceof RuntimeModeDecisionError &&
          error.code === 'scope_mismatch'
          ? 'scope_mismatch'
          : 'decision_failed',
        error instanceof Error ? error.message : 'runtime decision failed',
      );
    }
  }

  async #deliver(
    command: RuntimeExecutionCommand,
    connection: ChatwootDeliveryConnection | null,
    messageType: ChatwootDeliveryMessageType,
    outcome: Extract<RuntimeExecutionOutcome, 'private_noted' | 'replied'>,
    successReason: Extract<
      TicketExecutionReasonCode,
      'shadow_note_delivered' | 'auto_reply_delivered'
    >,
    occurredAt: string,
  ): Promise<CompletedSideEffect> {
    const content = command.pipeline.response.text ?? '';
    let receipt: RuntimeExecutionResult['delivery_receipt'] = null;
    let adapterFailure = false;
    if (connection !== null) {
      try {
        receipt = await this.delivery.deliver(
          deliveryCommand(command, messageType, content),
          connection,
          occurredAt,
        );
      } catch {
        adapterFailure = true;
      }
    }
    const delivered =
      receipt?.status === 'succeeded' || receipt?.status === 'duplicate';
    const transitionResult = this.#transition(
      command,
      delivered ? outcome : 'failed',
      delivered ? successReason : 'delivery_failed',
      delivered ? messageType : 'delivery-failed',
      occurredAt,
    );
    return {
      outcome: delivered ? outcome : 'failed',
      transition: transitionResult.transition,
      approval: null,
      delivery_receipt: receipt,
      failure_reason: delivered
        ? null
        : receipt?.code ??
          (adapterFailure
            ? 'chatwoot_adapter_failed'
            : 'chatwoot_connection_missing'),
      status:
        receipt?.status === 'duplicate' ||
        transitionResult.status === 'duplicate'
          ? 'duplicate'
          : 'applied',
    };
  }

  #createApproval(
    command: RuntimeExecutionCommand,
    occurredAt: string,
  ): CompletedSideEffect {
    let result: ApprovalCreationResult;
    try {
      result = this.approvals.create(
        {
          approval_id: command.approval_id,
          tenant_id: command.tenant_id,
          trace_id: command.trace_id,
          expected_state: command.expected_state,
          suggested_reply: command.pipeline.response.text ?? '',
          evidence_refs: command.pipeline.response.evidence_refs,
          tool_result_refs: command.pipeline.response.tool_result_refs,
          risk_reason: riskReason(command),
          generated_action: 'public_reply',
          version_snapshot: command.version_snapshot,
          expires_at: command.approval_expires_at,
          idempotency_key: `runtime:${command.idempotency_key}:approval`,
          created_at: occurredAt,
        },
        occurredAt,
      );
    } catch (error) {
      throw new RuntimeOrchestratorError(
        error instanceof ApprovalCreationError &&
          error.code === 'ticket_transition_failed'
          ? 'state_transition_failed'
          : 'approval_failed',
        error instanceof Error ? error.message : 'approval creation failed',
      );
    }
    return {
      outcome: 'approval_pending',
      transition: result.transition,
      approval: result,
      delivery_receipt: null,
      failure_reason: null,
      status: result.status === 'duplicate' ? 'duplicate' : 'applied',
    };
  }

  #transition(
    command: RuntimeExecutionCommand,
    nextState: TicketExecutionState,
    reasonCode: TicketExecutionReasonCode,
    suffix: string,
    occurredAt: string,
  ): CompletedTransition {
    try {
      const result = this.stateMachine.transition(
        {
          tenant_id: command.tenant_id,
          trace_id: command.trace_id,
          expected_state: command.expected_state,
          next_state: nextState,
          reason_code: reasonCode,
          actor_type: 'system',
          actor_id: null,
          idempotency_key: `runtime:${command.idempotency_key}:${suffix}`,
          occurred_at: occurredAt,
        },
        occurredAt,
      );
      return { status: result.status, transition: result.transition };
    } catch (error) {
      throw new RuntimeOrchestratorError(
        'state_transition_failed',
        error instanceof TicketExecutionTransitionError
          ? error.code
          : 'ticket transition failed',
      );
    }
  }
}

function deliveryCommand(
  command: RuntimeExecutionCommand,
  messageType: ChatwootDeliveryMessageType,
  content: string,
): ChatwootDeliveryCommand {
  return {
    delivery_id: command.delivery_id,
    tenant_id: command.tenant_id,
    trace_id: command.trace_id,
    conversation_id: command.conversation_id,
    message_type: messageType,
    content,
    content_hash: hash(content),
    idempotency_key: `runtime:${command.idempotency_key}:${messageType}`,
    deadline_at: command.deadline_at,
  };
}

function riskReason(command: RuntimeExecutionCommand): string {
  const decisionReasons = command.pipeline.risk.decisions
    .map((decision) => decision.reason_code)
    .join(',');
  return [
    command.pipeline.risk.highest_severity,
    command.pipeline.risk.recommendation,
    decisionReasons || 'no_gate_findings',
  ].join(':');
}

function validateCommand(
  command: RuntimeExecutionCommand,
  occurredAt: string,
): void {
  const scopeMismatch =
    command.tenant_id !== command.pipeline.trace_append.tenant_id ||
    command.trace_id !== command.pipeline.trace_append.trace_id ||
    command.tenant_id !== command.pipeline.risk.tenant_id ||
    command.trace_id !== command.pipeline.risk.trace_id ||
    command.tenant_id !== command.runtime_config.tenant_id ||
    command.pipeline.risk.risk_rule_version_id !==
      command.version_snapshot.risk_rule_version_id;
  if (scopeMismatch) {
    throw new RuntimeOrchestratorError(
      'scope_mismatch',
      'runtime command does not match pipeline, risk, config, or version scope',
    );
  }
  if (
    !isUuid(command.execution_id) ||
    !isUuid(command.tenant_id) ||
    !isUuid(command.trace_id) ||
    !isUuid(command.delivery_id) ||
    !isUuid(command.approval_id) ||
    !['planned', 'waiting_tool'].includes(command.expected_state) ||
    !['shadow', 'assist', 'auto'].includes(command.requested_mode) ||
    !/^[1-9]\d*$/.test(command.conversation_id) ||
    !/^[A-Za-z0-9._:-]{1,256}$/.test(command.idempotency_key) ||
    !validVersionSnapshot(command.version_snapshot) ||
    Date.parse(command.deadline_at) <= Date.parse(occurredAt) ||
    Number.isNaN(Date.parse(command.deadline_at)) ||
    Date.parse(command.approval_expires_at) <= Date.parse(occurredAt) ||
    Number.isNaN(Date.parse(command.approval_expires_at)) ||
    command.pipeline.response.delivery_performed !== false ||
    command.pipeline.response.approval_created !== false
  ) {
    throw new RuntimeOrchestratorError(
      'invalid_command',
      'runtime execution command is incomplete or invalid',
    );
  }
}

function validVersionSnapshot(
  snapshot: RuntimeExecutionCommand['version_snapshot'],
): boolean {
  return (
    snapshot.agent_version_id.trim().length > 0 &&
    snapshot.prompt_version_id.trim().length > 0 &&
    snapshot.policy_version_id.trim().length > 0 &&
    snapshot.tool_manifest_version_id.trim().length > 0 &&
    snapshot.risk_rule_version_id.trim().length > 0 &&
    snapshot.retrieval_config_version_id.trim().length > 0 &&
    isUuid(snapshot.model_config_version_id)
  );
}

function hashExecutionInput(command: RuntimeExecutionCommand): string {
  return hash(
    JSON.stringify({
      tenant_id: command.tenant_id,
      trace_id: command.trace_id,
      conversation_id: command.conversation_id,
      expected_state: command.expected_state,
      requested_mode: command.requested_mode,
      pipeline: command.pipeline,
      runtime_config: command.runtime_config,
      version_snapshot: command.version_snapshot,
      daily_budget_exceeded: command.daily_budget_exceeded,
      approval_expires_at: normalizeTimestamp(command.approval_expires_at),
    }),
  );
}

function normalizeTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RuntimeOrchestratorError(
      'invalid_command',
      'runtime execution timestamps must be valid',
    );
  }
  return date.toISOString();
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

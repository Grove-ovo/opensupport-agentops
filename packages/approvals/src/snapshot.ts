import { createHash } from 'node:crypto';
import {
  isUuid,
  type ApprovalCreationResult,
  type ApprovalRequest,
  type ApprovalSnapshot,
  type CreateApprovalCommand,
  type TraceVersionSnapshot,
} from '@opensupport/shared';
import {
  MemoryTicketExecutionStateMachine,
  TicketExecutionTransitionError,
} from '@opensupport/runtime-control';

export type ApprovalCreationErrorCode =
  | 'invalid_command'
  | 'idempotency_conflict'
  | 'active_approval_conflict'
  | 'ticket_transition_failed';

export class ApprovalCreationError extends Error {
  constructor(readonly code: ApprovalCreationErrorCode, message: string) {
    super(message);
    this.name = 'ApprovalCreationError';
  }
}

export function createApprovalRequest(
  command: CreateApprovalCommand,
  now: Date | string = new Date(),
): ApprovalRequest {
  const createdAt = normalizeTimestamp(command.created_at ?? now);
  validateCommand(command, createdAt);
  const snapshot: ApprovalSnapshot = Object.freeze({
    suggested_reply: command.suggested_reply,
    evidence_refs: Object.freeze([...command.evidence_refs]),
    tool_result_refs: Object.freeze([...command.tool_result_refs]),
    risk_reason: command.risk_reason,
    generated_action: command.generated_action,
    version_snapshot: Object.freeze({ ...command.version_snapshot }),
  });
  return Object.freeze({
    approval_id: command.approval_id,
    tenant_id: command.tenant_id,
    trace_id: command.trace_id,
    state: 'pending',
    snapshot,
    expires_at: normalizeTimestamp(command.expires_at),
    idempotency_key: command.idempotency_key,
    input_hash: hashApprovalInput(command),
    created_at: createdAt,
    action: null,
  });
}

export class MemoryApprovalRepository {
  readonly #byTrace = new Map<string, ApprovalRequest>();
  readonly #byIdempotency = new Map<string, ApprovalRequest>();

  constructor(readonly stateMachine: MemoryTicketExecutionStateMachine) {}

  create(
    command: CreateApprovalCommand,
    now?: Date | string,
  ): ApprovalCreationResult {
    const candidate = createApprovalRequest(command, now);
    const idempotencyScope = `${command.tenant_id}:${command.trace_id}:${command.idempotency_key}`;
    const existingByKey = this.#byIdempotency.get(idempotencyScope);
    if (existingByKey !== undefined) {
      if (existingByKey.input_hash !== candidate.input_hash) {
        throw new ApprovalCreationError(
          'idempotency_conflict',
          'approval idempotency key was reused with a different snapshot',
        );
      }
      return { status: 'duplicate', approval: existingByKey };
    }

    const traceScope = `${command.tenant_id}:${command.trace_id}`;
    const active = this.#byTrace.get(traceScope);
    if (active !== undefined) {
      if (active.input_hash === candidate.input_hash) {
        return { status: 'duplicate', approval: active };
      }
      throw new ApprovalCreationError(
        'active_approval_conflict',
        'trace already has a different pending approval',
      );
    }

    try {
      this.stateMachine.transition(
        {
          tenant_id: command.tenant_id,
          trace_id: command.trace_id,
          expected_state: command.expected_state,
          next_state: 'waiting_approval',
          reason_code: 'approval_required',
          actor_type: 'system',
          actor_id: null,
          idempotency_key: `approval:${command.idempotency_key}`,
          occurred_at: candidate.created_at,
        },
        candidate.created_at,
      );
    } catch (error) {
      throw new ApprovalCreationError(
        'ticket_transition_failed',
        error instanceof TicketExecutionTransitionError
          ? error.code
          : 'ticket transition failed',
      );
    }

    this.#byTrace.set(traceScope, candidate);
    this.#byIdempotency.set(idempotencyScope, candidate);
    return { status: 'created', approval: candidate };
  }

  findPending(tenantId: string, traceId: string): ApprovalRequest | undefined {
    return this.#byTrace.get(`${tenantId}:${traceId}`);
  }

  replace(request: ApprovalRequest): void {
    this.#byTrace.set(
      `${request.tenant_id}:${request.trace_id}`,
      Object.freeze(request),
    );
  }
}

function validateCommand(
  command: CreateApprovalCommand,
  createdAt: string,
): void {
  if (
    !isUuid(command.approval_id) ||
    !isUuid(command.tenant_id) ||
    !isUuid(command.trace_id) ||
    !['planned', 'waiting_tool'].includes(command.expected_state) ||
    command.suggested_reply.trim().length === 0 ||
    command.suggested_reply.length > 20_000 ||
    !validRefs(command.evidence_refs) ||
    !validRefs(command.tool_result_refs) ||
    command.evidence_refs.length + command.tool_result_refs.length === 0 ||
    command.risk_reason.trim().length === 0 ||
    command.risk_reason.length > 1_000 ||
    command.generated_action !== 'public_reply' ||
    !validVersionSnapshot(command.version_snapshot) ||
    !/^[A-Za-z0-9._:-]{1,256}$/.test(command.idempotency_key) ||
    Date.parse(command.expires_at) <= Date.parse(createdAt)
  ) {
    throw new ApprovalCreationError(
      'invalid_command',
      'approval command is incomplete or invalid',
    );
  }
}

function validRefs(values: readonly string[]): boolean {
  return (
    new Set(values).size === values.length &&
    values.every(
      (value) =>
        value.trim() === value && value.length > 0 && value.length <= 512,
    )
  );
}

function validVersionSnapshot(snapshot: TraceVersionSnapshot): boolean {
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

function hashApprovalInput(command: CreateApprovalCommand): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        tenant_id: command.tenant_id,
        trace_id: command.trace_id,
        expected_state: command.expected_state,
        suggested_reply: command.suggested_reply,
        evidence_refs: [...command.evidence_refs],
        tool_result_refs: [...command.tool_result_refs],
        risk_reason: command.risk_reason,
        generated_action: command.generated_action,
        version_snapshot: command.version_snapshot,
        expires_at: normalizeTimestamp(command.expires_at),
      }),
    )
    .digest('hex');
}

function normalizeTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApprovalCreationError(
      'invalid_command',
      'approval timestamps must be valid',
    );
  }
  return date.toISOString();
}

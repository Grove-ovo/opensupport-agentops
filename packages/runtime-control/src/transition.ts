import { createHash } from 'node:crypto';
import {
  isUuid,
  type TicketExecutionReasonCode,
  type TicketExecutionSnapshot,
  type TicketExecutionState,
  type TicketExecutionTransition,
  type TicketExecutionTransitionCommand,
  type TicketExecutionTransitionResult,
} from '@opensupport/shared';
import { TicketExecutionTransitionError } from './errors.js';

type TransitionRules = Readonly<
  Record<
    TicketExecutionState,
    Readonly<
      Partial<
        Record<TicketExecutionState, readonly TicketExecutionReasonCode[]>
      >
    >
  >
>;

type NormalizedTransitionCommand = Omit<
  TicketExecutionTransitionCommand,
  'occurred_at'
> & {
  occurred_at: string;
};

function reasons(
  ...values: TicketExecutionReasonCode[]
): readonly TicketExecutionReasonCode[] {
  return Object.freeze(values);
}

const TRANSITION_RULES: TransitionRules = Object.freeze({
  received: Object.freeze({
    normalized: reasons('pii_normalized'),
    failed: reasons('pipeline_failed', 'state_conflict'),
  }),
  normalized: Object.freeze({
    planned: reasons('plan_created'),
    failed: reasons('pipeline_failed', 'state_conflict'),
  }),
  planned: Object.freeze({
    waiting_tool: reasons('tool_required'),
    waiting_approval: reasons('approval_required'),
    replied: reasons('auto_reply_delivered'),
    private_noted: reasons(
      'shadow_note_delivered',
      'approval_rejected',
    ),
    handed_off: reasons(
      'human_handoff',
      'approval_escalated',
      'approval_expired',
    ),
    failed: reasons(
      'pipeline_failed',
      'delivery_failed',
      'state_conflict',
    ),
  }),
  waiting_tool: Object.freeze({
    planned: reasons('tool_completed'),
    waiting_approval: reasons('approval_required'),
    replied: reasons('auto_reply_delivered'),
    private_noted: reasons('shadow_note_delivered'),
    handed_off: reasons('human_handoff'),
    failed: reasons(
      'pipeline_failed',
      'delivery_failed',
      'state_conflict',
    ),
  }),
  waiting_approval: Object.freeze({
    replied: reasons('approval_reply_delivered'),
    private_noted: reasons('approval_rejected'),
    handed_off: reasons(
      'human_handoff',
      'approval_escalated',
      'approval_expired',
    ),
    failed: reasons('delivery_failed', 'state_conflict'),
  }),
  replied: Object.freeze({}),
  private_noted: Object.freeze({}),
  handed_off: Object.freeze({}),
  failed: Object.freeze({}),
});

export const TICKET_EXECUTION_TRANSITIONS: Readonly<
  Record<TicketExecutionState, readonly TicketExecutionState[]>
> = Object.freeze(
  Object.fromEntries(
    Object.entries(TRANSITION_RULES).map(([state, targets]) => [
      state,
      Object.freeze(Object.keys(targets)),
    ]),
  ) as Record<TicketExecutionState, readonly TicketExecutionState[]>,
);
const EXECUTION_STATES = new Set<TicketExecutionState>(
  Object.keys(TICKET_EXECUTION_TRANSITIONS) as TicketExecutionState[],
);
const ACTOR_TYPES = new Set<TicketExecutionTransitionCommand['actor_type']>([
  'system',
  'operator',
  'scheduler',
]);
const REASON_CODES = new Set<TicketExecutionReasonCode>(
  Object.values(TRANSITION_RULES).flatMap((targets) =>
    Object.values(targets).flat(),
  ),
);

export function applyTicketExecutionTransition(
  snapshot: TicketExecutionSnapshot,
  command: TicketExecutionTransitionCommand,
  existingTransition?: TicketExecutionTransition | undefined,
  now: Date | string = new Date(),
): TicketExecutionTransitionResult {
  const normalized = normalizeCommand(command, now);
  validateScope(snapshot, normalized);
  const inputHash = hashTransitionInput(normalized);

  if (existingTransition !== undefined) {
    if (
      existingTransition.tenant_id !== normalized.tenant_id ||
      existingTransition.trace_id !== normalized.trace_id ||
      existingTransition.idempotency_key !== normalized.idempotency_key ||
      existingTransition.input_hash !== inputHash
    ) {
      throw new TicketExecutionTransitionError(
        'idempotency_conflict',
        'idempotency key was already used for a different transition',
      );
    }
    return {
      status: 'duplicate',
      snapshot: Object.freeze({ ...snapshot }),
      transition: existingTransition,
    };
  }

  if (snapshot.execution_state !== normalized.expected_state) {
    throw new TicketExecutionTransitionError(
      'stale_state',
      `expected ${normalized.expected_state} but found ${snapshot.execution_state}`,
    );
  }
  const allowed = TICKET_EXECUTION_TRANSITIONS[snapshot.execution_state];
  if (allowed.length === 0) {
    throw new TicketExecutionTransitionError(
      'terminal_state',
      `${snapshot.execution_state} is terminal`,
    );
  }
  if (
    normalized.expected_state === normalized.next_state ||
    !allowed.includes(normalized.next_state) ||
    !transitionReasons(
      normalized.expected_state,
      normalized.next_state,
    ).includes(normalized.reason_code)
  ) {
    throw new TicketExecutionTransitionError(
      'invalid_transition',
      `${normalized.expected_state} cannot transition to ${normalized.next_state} with ${normalized.reason_code}`,
    );
  }

  const transition: TicketExecutionTransition = Object.freeze({
    transition_id: deterministicUuid(
      `${normalized.tenant_id}:${normalized.trace_id}:${normalized.idempotency_key}`,
    ),
    tenant_id: normalized.tenant_id,
    trace_id: normalized.trace_id,
    from_state: normalized.expected_state,
    to_state: normalized.next_state,
    reason_code: normalized.reason_code,
    actor_type: normalized.actor_type,
    actor_id: normalized.actor_id,
    idempotency_key: normalized.idempotency_key,
    input_hash: inputHash,
    created_at: normalized.occurred_at,
  });
  return {
    status: 'applied',
    snapshot: Object.freeze({
      tenant_id: normalized.tenant_id,
      trace_id: normalized.trace_id,
      execution_state: normalized.next_state,
    }),
    transition,
  };
}

function transitionReasons(
  fromState: TicketExecutionState,
  toState: TicketExecutionState,
): readonly TicketExecutionReasonCode[] {
  return TRANSITION_RULES[fromState][toState] ?? [];
}

export class MemoryTicketExecutionStateMachine {
  readonly #snapshots = new Map<string, TicketExecutionSnapshot>();
  readonly #transitions = new Map<string, TicketExecutionTransition>();

  seed(snapshot: TicketExecutionSnapshot): void {
    validateSnapshot(snapshot);
    this.#snapshots.set(snapshot.trace_id, Object.freeze({ ...snapshot }));
  }

  transition(
    command: TicketExecutionTransitionCommand,
    now?: Date | string,
  ): TicketExecutionTransitionResult {
    const snapshot = this.#snapshots.get(command.trace_id);
    if (snapshot === undefined) {
      throw new TicketExecutionTransitionError(
        'trace_not_found',
        'ticket execution trace was not found',
      );
    }
    const key = scopedIdempotencyKey(command);
    const result = applyTicketExecutionTransition(
      snapshot,
      command,
      this.#transitions.get(key),
      now,
    );
    if (result.status === 'applied') {
      this.#snapshots.set(command.trace_id, result.snapshot);
      this.#transitions.set(key, result.transition);
    }
    return result;
  }

  getSnapshot(traceId: string): TicketExecutionSnapshot | undefined {
    return this.#snapshots.get(traceId);
  }
}

function normalizeCommand(
  command: TicketExecutionTransitionCommand,
  now: Date | string,
): NormalizedTransitionCommand {
  if (
    !isUuid(command.tenant_id) ||
    !isUuid(command.trace_id) ||
    !EXECUTION_STATES.has(command.expected_state) ||
    !EXECUTION_STATES.has(command.next_state) ||
    !REASON_CODES.has(command.reason_code) ||
    !ACTOR_TYPES.has(command.actor_type) ||
    !/^[A-Za-z0-9._:-]{1,256}$/.test(command.idempotency_key) ||
    (command.actor_id !== null &&
      (command.actor_id.trim().length === 0 ||
        command.actor_id.trim().length > 256)) ||
    (command.actor_type === 'operator' && command.actor_id === null)
  ) {
    throw new TicketExecutionTransitionError(
      'invalid_command',
      'transition command contains invalid identifiers or actor scope',
    );
  }
  const occurredAt = normalizeTimestamp(command.occurred_at ?? now);
  return {
    ...command,
    actor_id: command.actor_id?.trim() ?? null,
    idempotency_key: command.idempotency_key.trim(),
    occurred_at: occurredAt,
  };
}

function validateSnapshot(snapshot: TicketExecutionSnapshot): void {
  if (
    !isUuid(snapshot.tenant_id) ||
    !isUuid(snapshot.trace_id) ||
    !EXECUTION_STATES.has(snapshot.execution_state)
  ) {
    throw new TicketExecutionTransitionError(
      'invalid_command',
      'snapshot contains invalid identifiers',
    );
  }
}

function validateScope(
  snapshot: TicketExecutionSnapshot,
  command: TicketExecutionTransitionCommand,
): void {
  validateSnapshot(snapshot);
  if (
    snapshot.tenant_id !== command.tenant_id ||
    snapshot.trace_id !== command.trace_id
  ) {
    throw new TicketExecutionTransitionError(
      'cross_scope',
      'transition command does not match the ticket execution scope',
    );
  }
}

function normalizeTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TicketExecutionTransitionError(
      'invalid_command',
      'occurred_at must be a valid timestamp',
    );
  }
  return date.toISOString();
}

function hashTransitionInput(
  command: NormalizedTransitionCommand,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        tenant_id: command.tenant_id,
        trace_id: command.trace_id,
        expected_state: command.expected_state,
        next_state: command.next_state,
        reason_code: command.reason_code,
        actor_type: command.actor_type,
        actor_id: command.actor_id,
        idempotency_key: command.idempotency_key,
      }),
      'utf8',
    )
    .digest('hex');
}

function scopedIdempotencyKey(
  command: TicketExecutionTransitionCommand,
): string {
  return `${command.tenant_id}:${command.trace_id}:${command.idempotency_key}`;
}

function deterministicUuid(value: string): string {
  const bytes = createHash('sha256')
    .update(value, 'utf8')
    .digest()
    .subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

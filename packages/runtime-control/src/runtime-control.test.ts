import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  TicketExecutionSnapshot,
  TicketExecutionTransitionCommand,
} from '@opensupport/shared';
import {
  MemoryTicketExecutionStateMachine,
  TicketExecutionTransitionError,
  applyTicketExecutionTransition,
} from './index.js';

const tenantId = '018f7f4a-7c1d-7b22-8d41-1234567890aa';
const otherTenantId = '018f7f4a-7c1d-7b22-8d41-1234567890ac';
const traceId = '018f7f4a-7c1d-7b22-8d41-1234567890ab';
const now = '2026-06-19T00:00:00.000Z';

test('applies the complete supported happy-path transition graph', () => {
  const machine = new MemoryTicketExecutionStateMachine();
  machine.seed(snapshot('received'));
  const transitions: readonly [
    TicketExecutionTransitionCommand['expected_state'],
    TicketExecutionTransitionCommand['next_state'],
    TicketExecutionTransitionCommand['reason_code'],
  ][] = [
    ['received', 'normalized', 'pii_normalized'],
    ['normalized', 'planned', 'plan_created'],
    ['planned', 'waiting_tool', 'tool_required'],
    ['waiting_tool', 'planned', 'tool_completed'],
    ['planned', 'waiting_approval', 'approval_required'],
    ['waiting_approval', 'replied', 'approval_reply_delivered'],
  ];
  for (const [index, [from, to, reason]] of transitions.entries()) {
    const result = machine.transition(
      command(from, to, reason, `transition-${index}`),
      now,
    );
    assert.equal(result.status, 'applied');
    assert.equal(result.transition.from_state, from);
    assert.equal(result.transition.to_state, to);
    assert.equal(result.snapshot.execution_state, to);
  }
});

test('returns the original transition for an identical retry', () => {
  const machine = new MemoryTicketExecutionStateMachine();
  machine.seed(snapshot('planned'));
  const input = command(
    'planned',
    'private_noted',
    'shadow_note_delivered',
    'shadow-note',
  );
  const first = machine.transition(input, now);
  const duplicate = machine.transition(input, '2026-06-19T01:00:00.000Z');

  assert.equal(duplicate.status, 'duplicate');
  assert.deepEqual(duplicate.transition, first.transition);
  assert.deepEqual(duplicate.snapshot, first.snapshot);
});

test('keeps the current snapshot when retrying an older transition key', () => {
  const machine = new MemoryTicketExecutionStateMachine();
  machine.seed(snapshot('planned'));
  const toolRequired = command(
    'planned',
    'waiting_tool',
    'tool_required',
    'tool-required',
  );
  const original = machine.transition(toolRequired, now);
  machine.transition(
    command(
      'waiting_tool',
      'planned',
      'tool_completed',
      'tool-completed',
    ),
    now,
  );

  const duplicate = machine.transition(toolRequired, now);

  assert.equal(duplicate.status, 'duplicate');
  assert.equal(duplicate.snapshot.execution_state, 'planned');
  assert.deepEqual(duplicate.transition, original.transition);
  assert.equal(machine.getSnapshot(traceId)?.execution_state, 'planned');
});

test('rejects an idempotency key reused for a different transition', () => {
  const machine = new MemoryTicketExecutionStateMachine();
  machine.seed(snapshot('planned'));
  machine.transition(
    command(
      'planned',
      'private_noted',
      'shadow_note_delivered',
      'same-key',
    ),
    now,
  );

  assertTransitionError(
    () =>
      machine.transition(
        command('planned', 'handed_off', 'human_handoff', 'same-key'),
        now,
      ),
    'idempotency_conflict',
  );
});

test('rejects stale, no-op, invalid reason, and terminal transitions', () => {
  assertTransitionError(
    () =>
      applyTicketExecutionTransition(
        snapshot('normalized'),
        command('received', 'normalized', 'pii_normalized', 'stale'),
        undefined,
        now,
      ),
    'stale_state',
  );
  assertTransitionError(
    () =>
      applyTicketExecutionTransition(
        snapshot('planned'),
        command('planned', 'planned', 'plan_created', 'no-op'),
        undefined,
        now,
      ),
    'invalid_transition',
  );
  assertTransitionError(
    () =>
      applyTicketExecutionTransition(
        snapshot('received'),
        command('received', 'failed', 'delivery_failed', 'invalid-edge-reason'),
        undefined,
        now,
      ),
    'invalid_transition',
  );
  assertTransitionError(
    () =>
      applyTicketExecutionTransition(
        snapshot('planned'),
        command('planned', 'replied', 'shadow_note_delivered', 'bad-reason'),
        undefined,
        now,
      ),
    'invalid_transition',
  );
  assertTransitionError(
    () =>
      applyTicketExecutionTransition(
        snapshot('replied'),
        command('replied', 'failed', 'delivery_failed', 'terminal'),
        undefined,
        now,
      ),
    'terminal_state',
  );
});

test('rejects cross-tenant and invalid actor scope', () => {
  assertTransitionError(
    () =>
      applyTicketExecutionTransition(
        snapshot('received'),
        {
          ...command(
            'received',
            'normalized',
            'pii_normalized',
            'cross-scope',
          ),
          tenant_id: otherTenantId,
        },
        undefined,
        now,
      ),
    'cross_scope',
  );
  assertTransitionError(
    () =>
      applyTicketExecutionTransition(
        snapshot('received'),
        {
          ...command(
            'received',
            'normalized',
            'pii_normalized',
            'operator-without-id',
          ),
          actor_type: 'operator',
          actor_id: null,
        },
        undefined,
        now,
      ),
    'invalid_command',
  );
});

function snapshot(
  executionState: TicketExecutionSnapshot['execution_state'],
): TicketExecutionSnapshot {
  return {
    tenant_id: tenantId,
    trace_id: traceId,
    execution_state: executionState,
  };
}

function command(
  expectedState: TicketExecutionTransitionCommand['expected_state'],
  nextState: TicketExecutionTransitionCommand['next_state'],
  reasonCode: TicketExecutionTransitionCommand['reason_code'],
  idempotencyKey: string,
): TicketExecutionTransitionCommand {
  return {
    tenant_id: tenantId,
    trace_id: traceId,
    expected_state: expectedState,
    next_state: nextState,
    reason_code: reasonCode,
    actor_type: 'system',
    actor_id: null,
    idempotency_key: idempotencyKey,
  };
}

function assertTransitionError(
  operation: () => unknown,
  code: TicketExecutionTransitionError['code'],
): void {
  assert.throws(
    operation,
    (error: unknown) =>
      error instanceof TicketExecutionTransitionError &&
      error.code === code,
  );
}

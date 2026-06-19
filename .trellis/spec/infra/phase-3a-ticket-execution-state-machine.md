# Phase 3A Ticket Execution State Machine

## Scenario: Guarded Ticket Execution Transitions

### 1. Scope / Trigger

- Trigger: changes to `TicketExecutionState`, transition commands, transition
  reasons, execution-state persistence, or transition audit records.
- Applies to `packages/shared/src/runtime-control.ts`,
  `packages/runtime-control`, migration `0006`, its live verification, and
  `docs/runtime_modes.md`.
- Does not authorize runtime downgrade policy, Chatwoot delivery, approvals,
  eval, or release gates.

### 2. Signatures

```ts
applyTicketExecutionTransition(
  snapshot: TicketExecutionSnapshot,
  command: TicketExecutionTransitionCommand,
  existingTransition?: TicketExecutionTransition,
  now?: Date | string,
): TicketExecutionTransitionResult
```

```sql
transition_ticket_execution(
  tenant_id,
  trace_id,
  expected_state,
  next_state,
  reason_code,
  actor_type,
  actor_id,
  idempotency_key,
  input_hash,
  created_at
)
```

### 3. Contracts

- The transition graph is an allow list over from-state, to-state, and reason.
- `replied`, `private_noted`, `handed_off`, and `failed` are terminal.
- Operator commands require an actor ID; system and scheduler actors may omit
  it.
- Idempotency scope is tenant + trace + idempotency key.
- Identical retries return the original transition; a reused key with different
  input is a conflict.
- PostgreSQL locks the trace before checking the idempotency record so
  concurrent identical commands serialize to one audit row.
- Migration `0003` temporarily drops the Phase 3A trace foreign key before it
  rebuilds the tenant/trace unique constraint; `0006` restores the foreign key.
- Audit rows are append-only and store hashes, not customer or provider data.
- Trace runtime mode and immutable version snapshots do not change.

### 4. Validation & Error Matrix

| Condition | TypeScript / PostgreSQL behavior |
|-----------|----------------------------------|
| Invalid ID, actor, key, timestamp | `invalid_command` / constraint failure |
| Trace does not exist | `trace_not_found` / foreign key error |
| Tenant or trace differs | `cross_scope` |
| Expected state is stale | `stale_state` / serialization failure |
| Terminal state exit | `terminal_state` / transition check failure |
| Unsupported edge or reason | `invalid_transition` / check violation |
| Identical idempotent retry | original transition |
| Conflicting idempotent retry | `idempotency_conflict` / unique violation |
| Direct execution-state update | check violation |
| Audit update/delete | check violation |

### 5. Good/Base/Bad Cases

- Good: lock trace, detect duplicate, validate edge, insert audit, update state.
- Good: keep intent and other operational trace fields independently mutable.
- Base: `received -> normalized` with `pii_normalized`.
- Bad: update `agent_traces.execution_state` directly.
- Bad: validate only the target state and ignore the source/reason pair.

### 6. Tests Required

- Unit tests cover the supported path, duplicate, conflict, stale state,
  no-op, invalid reason, terminal state, cross-scope, and actor validation.
- Static validation compares required contracts, migration function/trigger,
  docs, spec, and root scripts.
- Live PostgreSQL verification covers direct-update rejection, valid atomic
  transition, duplicate return, conflict, stale state, invalid edge,
  append-only audit, and immutable runtime mode.
- Run the complete migration chain twice and rerun Phase 1E verification.

### 7. Wrong vs Correct

#### Wrong

```sql
UPDATE agent_traces
SET execution_state = 'replied'
WHERE trace_id = $1;
```

This has no expected-state check, reason, actor, idempotency, or audit record.

#### Correct

```sql
SELECT *
FROM transition_ticket_execution(
  $tenant,
  $trace,
  'planned',
  'replied',
  'auto_reply_delivered',
  'system',
  NULL,
  $idempotency_key,
  $input_hash
);
```

The compare-and-set update and append-only audit are one transaction.

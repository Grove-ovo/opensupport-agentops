# Phase 3E Approval Actions

## State Contract

Only `pending` approvals may transition:

- approve -> approved + ticket replied
- edit -> edited + ticket replied
- reject -> rejected + ticket private_noted
- escalate -> escalated + ticket handed_off
- expire -> expired + ticket handed_off

Every transition is terminal. `apply_approval_action(...)` is the only database
mutation path; action rows are append-only and direct approval state updates
are rejected.

## Delivery Contract

- Approve and edit require a successful or duplicate public-delivery receipt.
- Reject, escalate, and expire must not contain delivery fields.
- A retryable delivery failure leaves the approval pending and can be retried
  with the same idempotency key.
- The ticket transition occurs only after a qualifying delivery receipt.

## Audit Contract

Operator actions require actor ID. Expiry requires scheduler actor and no actor
ID. Edited actions retain original snapshot text, edited text, and normalized
Unicode Levenshtein distance rounded to six decimals.

## Required Checks

- `npm run test:approvals`
- `npm run test:chatwoot`
- `npm run test:phase3e`
- `npm run typecheck`
- `npm run lint`
- `npm run db:migrate` twice
- `npm run db:verify:approval-actions`

## Scenario: Concurrent Approval Delivery Claim

### 1. Scope / Trigger

- Trigger: changing the production API path for approve/edit actions,
  PostgreSQL approval locking, persistent Chatwoot delivery attempts, or
  approval-action conflict mapping.
- Applies to `apps/api/src/operations.ts`,
  `apps/api/src/chatwoot-delivery.ts`,
  `apps/api/src/e2e-repository.ts`, and the real API E2E profile.

### 2. Signatures

```ts
PostgresOperationsService.applyApprovalAction(command)
PersistentChatwootDeliveryService.deliver(command, connection, executor?)
ProductionE2ERepository.getChatwootConnection(tenantId, executor?)
ProductionE2ERepository.claimDelivery(input, executor?)
ProductionE2ERepository.completeDelivery(
  deliveryId,
  status,
  code,
  providerMessageId,
  responseHash,
  executor?,
)
```

### 3. Contracts

- Approve/edit starts a PostgreSQL transaction and locks the tenant-scoped
  approval row with `SELECT ... FOR UPDATE` before provider I/O.
- The first pending action owns the public-reply side effect. Concurrent
  different-key actions serialize on the row lock and return
  `approval_not_pending` before creating another delivery attempt.
- Same-input, same-key retries against a terminal approval return the original
  action without another provider call. Changed input returns
  `approval_action_conflict`.
- Every database operation while the approval client is held must reuse that
  client: approval read, connection read, trace read, delivery claim/complete,
  terminal action, and final summary read. Reacquiring the same pool can starve
  when concurrent requests equal or exceed the pool size.
- A failed provider attempt is committed while the approval remains pending.
  Retrying the same key reclaims that attempt and increments `attempt_count`.

### 4. Validation & Error Matrix

| Condition | Behavior |
|-----------|----------|
| Approval missing | `404 approval_not_found`, no provider I/O |
| Approval already terminal, different key | `409 approval_not_pending`, no provider I/O |
| Same key, changed action input | `409 approval_action_conflict`, no provider I/O |
| Chatwoot connection missing | `503 chatwoot_connection_unavailable`, approval remains pending |
| Chatwoot delivery fails | `502 chatwoot_<code>`, failed attempt committed, approval remains pending |
| Concurrent different keys | one terminal action and one public reply; all losers return `409` |

### 5. Good/Base/Bad Cases

- Good: lock approval, reuse one client through delivery persistence and final
  action, then commit.
- Base: a provider failure commits only the failed delivery attempt and permits
  a same-key retry.
- Bad: load `pending`, release the row, deliver externally, then attempt CAS.
- Bad: hold a pool client and call repository methods that silently reacquire
  the same pool.

### 6. Tests Required

- Real PostgreSQL E2E runs at least 12 simultaneous approve commands with
  distinct keys against one approval and asserts one success, one delivery
  attempt, one public reply, and stable `409` losers.
- The same E2E forces a retryable Chatwoot failure, asserts the approval stays
  pending with a failed attempt, retries the same key, and asserts
  `attempt_count = 2` plus a terminal approval.
- Run `npm run test:integration:real -- --down`; all live-service TAP summaries
  must report zero skipped tests.

### 7. Wrong vs Correct

#### Wrong

```ts
const approval = await pool.query('SELECT ...');
await delivery.deliver(command, connection);
await pool.query('SELECT apply_approval_action(...)');
```

Both operators may deliver before either terminal CAS succeeds.

#### Correct

```ts
const client = await pool.connect();
await client.query('BEGIN');
const approval = await loadApproval(client, true);
const receipt = await delivery.deliver(command, connection, client);
await applyApprovalAction(client, approval, receipt);
await client.query('COMMIT');
```

The row lock owns the side effect, and nested storage work cannot exhaust the
pool by borrowing another client.

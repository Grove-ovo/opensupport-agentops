# Phase 6C Operations Dashboard

## 1. Scope / Trigger

This contract applies when adding or changing operator dashboard APIs, approval
actions, release transitions, or tenant/model/Chatwoot settings.

## 2. Signatures

- `GET /api/v1/tenants/:tenantId/overview`
- `GET /api/v1/tenants/:tenantId/traces/:traceId`
- `POST /api/v1/tenants/:tenantId/approvals/:approvalId/actions`
- `GET /api/v1/tenants/:tenantId/releases/:candidateId`
- `POST /api/v1/tenants/:tenantId/releases/:candidateId/transitions`
- `GET|PUT /api/v1/tenants/:tenantId/settings/*`
- `useResource<T>(key: string, loader: () => Promise<T>): Resource<T>`

## 3. Contracts

Approval actions accept `approve | edit | reject | escalate`, `actor_id`,
`idempotency_key`, optional `edited_reply`, and literal `confirm: true`.
Release transitions accept only `start_evaluation | archive`.

Settings responses expose boolean secret presence and masked reference hints.
They never expose API keys, webhook secrets, access tokens, encrypted
references, or provider request/response payloads.

## 4. Validation & Error Matrix

| Condition | Result |
|---|---|
| `confirm` missing or false | `400 invalid_request` |
| Approval not pending | `409 approval_not_pending` |
| Public Chatwoot delivery fails | `502 chatwoot_<code>`; approval unchanged |
| Release transition not allowed | `409 release_transition_not_allowed` |
| Secret reference is not `env:NAME` | `400 invalid_secret_reference` |
| Tenant-scoped record missing | `404 <resource>_not_found` |

## 5. Good / Base / Bad Cases

- Good: approve delivers the immutable reply, records delivery receipt, then
  applies the PostgreSQL approval transition.
- Base: reject changes only the approval state and audit record.
- Bad: never mark approval approved before Chatwoot confirms public delivery.

## 6. Tests Required

- API route test: false confirmation is rejected and commands preserve actor,
  action, edited reply, and idempotency key.
- Integration test: Assist creates a pending approval; operator approval sends
  one public Chatwoot message and persists `approved`.
- Vitest: overview, explicit approval confirmation, and dependency failure.
- Playwright: desktop and mobile workflows, screenshots, and no horizontal
  viewport overflow.
- Build: `npm run typecheck` and `npm run build:web`.

## 7. Wrong vs Correct

### Wrong

```ts
await setApprovalState('approved');
await sendChatwootReply(reply);
```

### Correct

```ts
const receipt = await sendChatwootReply(reply);
await applyApprovalAction({ expectedState: 'pending', receipt });
```

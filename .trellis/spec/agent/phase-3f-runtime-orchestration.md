# Phase 3F Runtime Orchestration

## Scenario: Controlled Runtime Side Effects

### 1. Scope / Trigger

- Trigger: changes that compose an `AgentPipelineRun` with runtime mode
  decisions, ticket transitions, Chatwoot delivery, or approval creation.
- Applies to `packages/runtime-orchestrator`, runtime integration tests, and
  Phase 3 parent validation.
- Phase 2 remains proposal-only. Phase 3F does not own model, retrieval, tool,
  eval, or release-gate execution.

### 2. Signature

```ts
RuntimeOrchestrator.execute(
  command: RuntimeExecutionCommand,
  connection: ChatwootDeliveryConnection | null,
  now?: Date | string,
): Promise<RuntimeExecutionResult>
```

### 3. Contracts

- Shadow can produce only a private note or handoff.
- Assist can create an approval only when suggested text and at least one
  evidence or successful tool-result reference can be frozen in the snapshot.
- Auto can produce a public reply only after the pure runtime decision allows
  it.
- P0/blocking risk, missing grounding, daily budget exhaustion, and uncertain
  delivery never produce a public reply.
- One tenant/trace/idempotency key claims one complete runtime execution,
  including concurrent calls.
- A trace-level claim rejects competing execution keys before provider I/O.
  Rejected or uncertain executions retain that claim and require operator
  reconciliation rather than an unsafe automatic retry.
- Delivery, approval, and transition services keep their own narrower
  idempotency scopes so a service restart cannot duplicate the side effect.
- The approval repository returns the exact `waiting_approval` transition
  audit used by the orchestration result.
- Runtime audit stores identifiers, stable decision reasons, latency, cost,
  failure code, and an input hash. It does not store credentials.
- Approval actions remain a separate operator/scheduler command boundary.

### 4. Validation & Error Matrix

| Condition | Behavior |
|-----------|----------|
| Tenant/trace/config/risk scope differs | `scope_mismatch` |
| Invalid ID, state, key, version, or timestamp | `invalid_command` |
| Same execution key and same input | original result with duplicate status |
| Same execution key and changed input | `idempotency_conflict` |
| Different execution key for a claimed trace | `idempotency_conflict` |
| Expected state is stale | reject before provider I/O |
| Missing Chatwoot connection | ticket fails closed, no reply is claimed |
| Provider delivery failure | `failed` with delivery receipt and transition |
| Approval snapshot rejected | no public delivery; orchestration error |
| Ticket compare-and-set fails | `state_transition_failed` |

### 5. Good/Base/Bad Cases

- Good: one grounded Auto command claims the trace, sends one public reply,
  and returns decision, receipt, and transition IDs in one audit result.
- Base: one Assist command creates a pending immutable approval and sends
  nothing until a separate operator action.
- Bad: call Chatwoot before validating tenant/trace scope and expected state.
- Bad: treat a tool-result reference as grounded without finding a matching
  successful or duplicate result for every tool request.

### 6. Tests Required

- Shadow private-only, Assist approval-only, and allowed Auto public delivery.
- Concurrent duplicate execution produces one Chatwoot request.
- Competing execution keys for one trace are rejected before provider I/O.
- P0, missing grounding, and cost cap prevent Auto.
- High-risk refund dry-run work requires approval; failed tool results cannot
  qualify for approval or Auto.
- Delivery failure records a failed outcome.
- Approve/edit can deliver after Assist; reject/escalate/expire cannot.
- Audit references decision, transition, approval/delivery, latency, and cost.
- Run `npm run test:phase3f`, `npm run test:runtime-orchestrator`,
  `npm run test:phase3`, full tests, migration chain twice, and all Phase 3
  PostgreSQL verification scripts.

### 7. Wrong vs Correct

#### Wrong

```ts
if (command.requested_mode === 'auto') {
  await chatwoot.deliver(publicReply(command));
}
```

This skips the effective-mode decision, expected-state check, grounding, risk,
budget, and trace-level execution claim.

#### Correct

```ts
const result = await runtimeOrchestrator.execute(
  command,
  chatwootConnection,
);
```

The orchestrator validates scope and state, claims the trace, evaluates the
pure decision, and invokes exactly one guarded side-effect path.

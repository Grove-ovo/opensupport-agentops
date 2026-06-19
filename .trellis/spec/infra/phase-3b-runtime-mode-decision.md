# Phase 3B Runtime Mode Decision

## Scenario: Deterministic Runtime Action Selection

### 1. Scope / Trigger

- Trigger: changes to runtime config versions, Auto eligibility, downgrade
  policy, or requested/effective mode decisions.
- Applies to runtime-mode shared contracts, `packages/runtime-control`,
  migration `0007`, live verification, and `docs/runtime_modes.md`.
- Does not authorize delivery or approval persistence.

### 2. Signatures

```ts
decideRuntimeMode(
  input: RuntimeModeDecisionInput,
  now?: Date | string,
): RuntimeModeDecision
```

### 3. Contracts

- Requested mode is immutable input; effective mode is decision output.
- Shadow maps to private note or handoff.
- Assist maps to approval creation or handoff.
- Auto public reply requires configured intent, proposal text, required
  grounding, non-blocking risk within threshold, latency within limit, and
  ticket cost within limit.
- Daily budget exhaustion always forces Shadow.
- Missing grounding forces Shadow or handoff because Assist cannot create a
  valid immutable approval snapshot.
- Config versions and decision rows are immutable; only config activation may
  change.
- The pure decision function performs no Chatwoot or approval side effect.

### 4. Validation & Error Matrix

| Condition | Result |
|-----------|--------|
| P0/blocking risk | Shadow handoff |
| Missing proposal | handoff |
| Unsupported Auto intent | configured downgrade |
| Missing evidence/tool refs | Shadow or handoff |
| Ticket cost exceeded | configured downgrade |
| Daily budget exceeded | Shadow |
| Latency exceeded | configured downgrade |
| Valid low-risk Auto | public reply |
| Tenant/config mismatch | `scope_mismatch` |

### 5. Good/Base/Bad Cases

- Good: record `requested=auto`, `effective=assist`, and exact reasons.
- Base: Shadow with text produces private note.
- Bad: mutate `agent_traces.runtime_mode` to represent a downgrade.
- Bad: perform delivery inside the decision function.

### 6. Tests Required

- Unit tests cover Shadow, Assist, allowed Auto, P0, grounding, unsupported
  intent, cost, latency, daily budget, and tenant mismatch.
- Live verification covers immutable config/decision and single-active config.
- Run migration chain twice plus all earlier database verifications.

### 7. Wrong vs Correct

#### Wrong

```ts
if (mode === 'auto') await sendReply();
```

#### Correct

```ts
const decision = decideRuntimeMode(input);
return runtimeAdapter.execute(decision);
```

Policy remains deterministic and side effects stay isolated.

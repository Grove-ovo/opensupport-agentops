# Phase 4C Security Eval

## Scenario: Deterministic Adversarial Evaluation

### 1. Scope / Trigger

- Trigger: changes to adversarial case execution, P0 decisions, forbidden
  outcomes, or zero-tolerance security metrics.
- Applies to `packages/eval/src/security.ts` and the security section of
  `docs/eval_framework.md`.
- Does not transition release candidates or deliver customer messages.

### 2. Signature

```ts
SecurityEvalRunner.run(
  command: RunSecurityEvalCommand,
  now?: Date | string,
): Promise<SecurityEvalResult>
```

### 3. Contracts

- One run uses one tenant, dataset version, split, and candidate hash.
- Candidate execution returns a normalized project-owned observation.
- Required safe actions and forbidden actions/tools are evaluated
  deterministically after candidate execution.
- Every P0 case must block; unsafe action, PII leak, and unauthorized access
  rates are zero-tolerance metrics.
- Observations, reason codes, metrics, and completed runs are immutable.
- Identical retries share one result; changed input under the same key fails.

### 4. Validation & Error Matrix

| Condition | Behavior |
|-----------|----------|
| Invalid IDs/key/hash/empty cases | `invalid_command` |
| Case or observation scope mismatch | `scope_mismatch` |
| Reused key with changed input | `idempotency_conflict` |
| Candidate executor throws | `executor_failed` |
| Missing result during metric calculation | `invalid_command` |

### 5. Good/Base/Bad Cases

- Good: execute each committed split independently and aggregate reporting.
- Base: required safe action is returned and every P0 case is blocking.
- Bad: trust a model-provided safety score instead of evaluating outcomes.
- Bad: permit a public reply because the generated text claims it is safe.

### 6. Tests Required

- Execute all 40 committed cases across their immutable splits.
- Cover P0, forbidden action/tool, PII, and unauthorized-access failures.
- Cover duplicate, idempotency conflict, executor failure, and scope mismatch.
- Static validation forbids runtime delivery and release transition imports.

### 7. Wrong vs Correct

#### Wrong

```ts
const passed = observation.modelSafetyScore > 0.9;
```

#### Correct

```ts
const passed = evaluateForbiddenOutcomes(securityCase, observation);
```

The candidate supplies observations; application-owned rules supply the
authoritative security decision.

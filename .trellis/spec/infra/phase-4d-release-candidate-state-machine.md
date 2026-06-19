# Phase 4D Release Candidate State Machine

## Scenario: Immutable Candidate Evaluation

### 1. Scope / Trigger

- Trigger: changes to release candidate snapshots, Eval Run references, state
  transitions, or candidate persistence.
- Applies to `packages/shared/src/release.ts`,
  `packages/eval/src/release-candidate.ts`, and migration `0011`.
- Does not calculate gate decisions or deploy promoted candidates.

### 2. Signatures

```ts
createReleaseCandidate(command, replayRun, securityRun, now?)
applyReleaseCandidateTransition(candidate, command, existing?, now?)
```

```sql
transition_release_candidate(
  tenant_id,
  candidate_id,
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

- Freeze all seven `TraceVersionSnapshot` IDs and exact replay/security Run IDs.
- Both Eval Runs must be succeeded, tenant-scoped, correctly typed, and use
  the same seven-version config hash.
- The only graph is
  `draft -> evaluating -> failed|shadow|assist|auto -> archived`.
- Every transition is compare-and-set, reason-bound, actor-scoped, timestamped,
  idempotent, and append-only.
- Snapshot columns and candidate deletion are immutable.

### 4. Error Matrix

| Condition | TypeScript | PostgreSQL |
|-----------|------------|------------|
| Invalid IDs/versions/actor/key | `invalid_command` | constraint violation |
| Eval tenant/type/status/hash mismatch | `eval_scope_mismatch` | check/FK violation |
| Candidate tenant mismatch | `cross_scope` | not found/FK violation |
| Expected state mismatch | `stale_state` | serialization failure |
| Invalid edge/reason | `invalid_transition` | check violation |
| Archived transition | `terminal_state` | check violation |
| Reused key with changed input | `idempotency_conflict` | unique violation |

### 5. Tests Required

- Cover all four evaluating outcomes and archive transitions.
- Cover stale, invalid, terminal, cross-scope, and conflicting retries.
- Run migration twice and the live PostgreSQL verification.
- Verify direct snapshot/state mutation and transition mutation are rejected.

### 6. Wrong vs Correct

#### Wrong

```sql
UPDATE release_candidates SET state = 'auto';
```

#### Correct

```sql
SELECT transition_release_candidate(...);
```

Release Gate consumes an immutable candidate; it never edits the candidate it
is evaluating.

# Release Gate

Status: Phase 4D immutable candidate and state-machine foundation

## Candidate Snapshot

A release candidate pins one tenant to:

- `agent_version_id`
- `prompt_version_id`
- `policy_version_id`
- `tool_manifest_version_id`
- `risk_rule_version_id`
- `retrieval_config_version_id`
- `model_config_version_id`
- one completed replay Eval Run
- one completed security Eval Run

`config_snapshot_hash` covers the seven version IDs. Both Eval Runs must have
been executed against that exact hash. `snapshot_hash` additionally covers the
candidate identity and exact Eval Run IDs. The snapshot cannot be updated or
deleted after creation.

## State Machine

```text
draft -> evaluating -> failed -> archived
                    -> shadow -> archived
                    -> assist -> archived
                    -> auto   -> archived
```

Every transition requires the expected current state, a graph-owned reason
code, actor scope, timestamp, idempotency key, and input hash. Identical
retries return the existing transition. Reusing a key with changed input,
stale state, invalid graph edge, cross-tenant scope, and transitions from
`archived` fail closed.

PostgreSQL requires `transition_release_candidate(...)` for state updates. It
atomically locks the candidate, validates compare-and-set state, appends the
audit row, and changes state. Direct state/snapshot mutation and transition
row updates or deletes are rejected by triggers.

Phase 4E will calculate gate decisions against candidates in `evaluating`; it
cannot substitute config versions or Eval Runs.

## Commands

```text
npm run test:phase4d
npm run test:eval
npm run db:migrate
npm run db:verify:release-candidate
```

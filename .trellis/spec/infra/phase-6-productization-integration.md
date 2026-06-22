# Phase 6 Productization Integration

## 1. Scope / Trigger

Use this contract when completing or reopening the Phase 6 parent task,
changing a Phase 6 child boundary, or changing the repository-wide
productization acceptance chain.

## 2. Signatures

- Aggregate command: `npm run test:phase6`
- Validator: `scripts/validate-phase6.mjs`
- Parent task: `06-20-phase-6-productization-real-e2e`
- Required children: Phase 6A, 6B, 6C, 6D, and 6E

## 3. Contracts

The parent phase is complete only when every required child task is archived
with `status=completed`. Runtime completion also requires independently
runnable API, web, and worker applications, migrations through `0016`,
production Compose and observability assets, operations runbooks, and the
production smoke harness.

`npm test` includes `test:phase6a` through `test:phase6e` followed by the
aggregate `test:phase6`. Child validators own component structure; the
aggregate validator owns phase completeness and stale-document detection.
The aggregate validator reads the active parent PRD while work is in progress
and falls back to the archived parent PRD after `trellis-finish-work`.

## 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| Any child task is active or missing | Aggregate validation fails |
| Any child task status is not `completed` | Aggregate validation fails |
| API, web, worker, migration, or deployment asset missing | Validation fails |
| Parent PRD retains pre-Phase-6 placeholder claims | Validation fails |
| Parent task has been archived | Validate the archived PRD path |
| README does not report production-oriented Phase 6 | Validation fails |
| All child and aggregate checks pass | Parent task may be archived |

## 5. Good / Base / Bad Cases

- Good: each child is independently checked, committed, archived, and merged
  before the parent acceptance boxes are completed.
- Base: documentation-only parent closure adds an aggregate validator and
  verification evidence without changing runtime behavior.
- Bad: never mark the parent complete because files exist while a child task
  remains active or failed.

## 6. Tests Required

- Run `npm run test:phase6`, `npm run typecheck`, and `npm run lint`.
- Run the complete `npm test` chain after adding the aggregate validator.
- Confirm real PostgreSQL/Redis integration, migration replay, browser tests,
  production Compose health, smoke, metrics, logs, and runbook dry-runs were
  completed by the child acceptance records.
- Run Trellis validation for the parent task.

## 7. Wrong vs Correct

### Wrong

```js
assert(filesExist);
console.log('Phase 6 complete');
```

### Correct

```js
for (const child of requiredChildren) {
  assert.equal(readArchivedTask(child).status, 'completed');
}
assert(requiredRuntimeAndDeploymentFilesExist());
```

# Phase 1 Foundation Integration

## Scenario: Repository-Level Phase 1 Acceptance Gate

### 1. Scope / Trigger

- Trigger: a Phase 1 migration, package, validation script, required document,
  or Trellis child task is added, renamed, removed, or reordered.
- Applies to `scripts/validate-phase1.mjs`, root `package.json`, Phase 1
  migrations and verification SQL, required Phase 1 docs/packages, and the
  Phase 1 parent/child Trellis records.
- Does not replace package unit tests, live PostgreSQL verification, Compose
  validation, or Trellis validation.
- Does not authorize Phase 2-5 runtime behavior.

### 2. Signatures

Repository integration gate:

```text
npm run test:phase1
node scripts/validate-phase1.mjs
```

Full quality gate:

```text
npm run lint
npm run typecheck
npm test
docker compose -f infra/docker/compose.phase1.yml config
PATH="/opt/homebrew/opt/libpq/bin:$PATH" npm run db:migrate
PATH="/opt/homebrew/opt/libpq/bin:$PATH" npm run db:verify
PATH="/opt/homebrew/opt/libpq/bin:$PATH" npm run db:verify:model-config
PATH="/opt/homebrew/opt/libpq/bin:$PATH" npm run db:verify:llm-observability
PATH="/opt/homebrew/opt/libpq/bin:$PATH" npm run db:verify:trace
```

### 3. Contracts

The root `test` script contains these commands in relative order:

```text
test:phase1
test:phase1a
test:phase1c
test:phase1d
test:phase1e
test:chatwoot
test:model-config
test:llm-observability
test:pii
test:trace
```

Later phase tests may be appended. The Phase 1 validator must treat this list
as an ordered required subsequence, not as the complete root test script.

The root `db:migrate` script executes migrations `0001` through `0004` in
numeric order.

The parent integration validator must assert:

- required migrations, Compose file, verification SQL, docs, packages, and
  child static validators exist
- root migration and test commands retain complete ordered coverage
- Phase 1A-1E child tasks are archived with `status=completed`
- parent and child Trellis records retain bidirectional links
- the parent PRD preserves Phase 1 scope and explicitly defers Phase 2-5

The validator is deterministic and local. It does not connect to PostgreSQL or
the network.

### 4. Validation & Error Matrix

| Condition | Expected behavior |
|-----------|-------------------|
| Required artifact missing | `test:phase1` exits non-zero and prints its path |
| Migration omitted or reordered | `test:phase1` exits non-zero |
| Required Phase 1 test omitted or reordered | `test:phase1` exits non-zero |
| Later phase test appended | Phase 1 validation continues to pass |
| Child archive missing or not completed | `test:phase1` exits non-zero |
| Parent/child task link differs | `test:phase1` exits non-zero |
| Parent PRD loses deferred roadmap or scope | `test:phase1` exits non-zero |
| Artifact JSON is malformed | `test:phase1` exits non-zero with parse error |
| Static gate passes but PostgreSQL constraint is broken | live DB verification must fail |

### 5. Good/Base/Bad Cases

- Good: add migration `0005`, update `db:migrate`, the integration validator,
  its owning spec, and relevant live verification in one task.
- Base: edit implementation internals without renaming a required artifact;
  the integration validator remains unchanged and package tests prove behavior.
- Bad: add a package test but omit it from root `npm test`.
- Bad: require root `npm test` to equal the Phase 1 command list exactly;
  later phases must be able to append their own suites.
- Bad: archive a child task without preserving its parent link.
- Bad: treat the static integration gate as proof that PostgreSQL migrations
  execute successfully.

### 6. Tests Required

- `npm run test:phase1` must pass.
- `npm test` must execute every Phase 1 static and package suite.
- `npm run lint` and `npm run typecheck` must pass.
- Run the complete ordered migration twice to verify idempotency.
- `db:verify` must list the six Phase 1 base tables.
- Phase 1C, 1D, and 1E live verification scripts must pass.
- Docker Compose and active Trellis task validation must pass.
- When changing `validate-phase1.mjs`, temporarily breaking one owned contract
  should produce a precise failure before the change is finalized.

### 7. Wrong vs Correct

#### Wrong

```json
{
  "scripts": {
    "test": "npm run test:chatwoot"
  }
}
```

This allows individual packages to pass while migrations, docs, later packages,
or completed Trellis slices silently disconnect from the Phase 1 baseline.

#### Correct

```json
{
  "scripts": {
    "test": "npm run test:phase1 && npm run test:phase1a && npm run test:phase1c && npm run test:phase1d && npm run test:phase1e && npm run test:chatwoot && npm run test:model-config && npm run test:llm-observability && npm run test:pii && npm run test:trace",
    "test:phase1": "node scripts/validate-phase1.mjs"
  }
}
```

The parent gate verifies repository connectivity while child static checks,
package tests, and live PostgreSQL checks verify their owned behavior.

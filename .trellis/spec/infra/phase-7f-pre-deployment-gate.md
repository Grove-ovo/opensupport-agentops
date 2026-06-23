# Phase 7F Pre-Deployment Aggregate Gate

## Scenario: One Reproducible Go/No-Go Staging Gate

### 1. Scope / Trigger

- Trigger: completing the Phase 7 parent task, or changes to the aggregate
  gate, residual-risk documentation, or staging readiness status.
- Applies to `scripts/validate-phase7.mjs`, `scripts/aggregate-gate-lib.mjs`,
  `scripts/aggregate-gate.test.mjs`, `README.md`, and `docs/architecture.md`.

### 2. Signatures

```text
npm run test:phase7f
npm run test:phase7
```

```ts
runAggregateGate(options): AggregateGateReport
writeAggregateReports(report, options): { jsonPath, markdownPath }
```

### 3. Contracts

- **All children must be archived completed.** The gate checks that Phase 7A
  through 7E are archived with `status: completed`. Any missing/incomplete child
  blocks the gate.
- **Evidence aggregation.** The gate aggregates CI pipeline (full-stack +
  supply-chain jobs), deploy preflight, recovery drill, supply-chain scan
  evidence (Trivy + SBOM), migration floor (version 16), and production docs.
- **Residual risks are explicit, owned, and non-secret.** The report lists
  residual risks with an owner. The staging-only boundary (self-hosted, not a
  SaaS control plane) is always listed as a known residual risk.
- **Rollback triggers are documented.** The report lists machine-readable
  rollback triggers: CI smoke failure, unresolved critical vulnerability,
  recovery drill record mismatch, and migration version below floor.
- **Reports are JSON + Markdown, secret-safe.** Written to
  `tmp/pre-deployment-gate.json` and `tmp/pre-deployment-gate.md` with mode
  0600. No real credentials, tokens, or secret values appear.
- **Status is `ready for staging deployment`, not `deployed`.** The README and
  architecture docs declare staging readiness; they do not claim production
  deployment has occurred.
- **No real external credential or public endpoint required.** The gate runs
  fully locally from repo state — it does not call any external service.

### 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| Any Phase 7 child not archived/completed | `children_archived` blocked |
| CI workflow missing full-stack or supply-chain job | `ci_pipeline` blocked |
| Deploy preflight scripts missing | `preflight` blocked |
| Recovery drill scripts missing | `recovery_drill` blocked |
| Trivy/SBOM actions absent from CI | `supply_chain` blocked |
| Migration 0016 file missing | `migration_floor` blocked |
| Production docs missing | `production_docs` blocked |
| README residual-risk phrases missing | `residual_risks` warning |
| README file missing entirely | `residual_risks` blocked |

### 5. Good / Base / Bad Cases

- Good: all 7A-7E archived, CI has both jobs, drill exists, README documents
  the staging boundary — gate reports `ready`.
- Base: README missing a boundary phrase — gate reports `warning` but still
  passes (residual risk documented in the report).
- Bad: a child task is still `planning` — gate blocks with
  `children_not_completed`.
- Bad: claim the system is `deployed` or `production-ready` in the README —
  the staging boundary language must remain.

### 6. Tests Required

- Unit tests (`scripts/aggregate-gate.test.mjs`): ready case against the real
  repo, blocked case (empty temp dir fails children check), markdown rendering
  (residual risks + rollback triggers), report file writing with mode 0600.
- The gate itself (`scripts/validate-phase7.mjs`) is the `test:phase7` command.

### 7. Wrong vs Correct

### Wrong

```sh
# claim production deployment
echo "Status: deployed to production" >> README.md
```

### Correct

```sh
node scripts/validate-phase7.mjs --json tmp/gate.json --markdown tmp/gate.md
# README says: "ready for staging deployment" — not deployed
```

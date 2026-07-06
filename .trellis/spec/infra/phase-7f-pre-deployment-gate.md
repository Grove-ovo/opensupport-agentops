# Phase 7F Pre-Deployment Aggregate Gate

## Scenario: One Reproducible Go/No-Go Staging Gate

### 1. Scope / Trigger

- Trigger: completing the Phase 7 parent task, or changes to the aggregate
  gate, residual-risk documentation, or staging readiness status.
- Applies to `scripts/validate-phase7.mjs`, `scripts/aggregate-gate-lib.mjs`,
  `scripts/aggregate-gate.test.mjs`, `scripts/production-load.mjs`,
  `scripts/production-load-lib.mjs`, `scripts/production-load.test.mjs`,
  `.github/workflows/ci.yml`, `README.md`, and `docs/architecture.md`.

### 2. Signatures

```text
npm run test:phase7f
npm run test:phase7
npm run perf:production
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
  supply-chain jobs), production HTTP load evidence, deploy preflight, recovery
  drill, supply-chain scan evidence (Trivy + SBOM), migration floor (version
  16), and production docs.
- **Residual risks are explicit, owned, and non-secret.** The report lists
  residual risks with an owner. The staging-only boundary (self-hosted, not a
  SaaS control plane) is always listed as a known residual risk.
- **Rollback triggers are documented.** The report lists machine-readable
  rollback triggers: CI smoke failure, production HTTP load threshold breach,
  unresolved critical vulnerability, recovery drill record mismatch, and
  migration version below floor.
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
| CI/package/script support for production HTTP load is missing | `production_http_load` blocked |
| Deploy preflight scripts missing | `preflight` blocked |
| Recovery drill scripts missing | `recovery_drill` blocked |
| Trivy/SBOM actions absent from CI | `supply_chain` blocked |
| Migration 0016 file missing | `migration_floor` blocked |
| Production docs missing | `production_docs` blocked |
| README residual-risk phrases missing | `residual_risks` warning |
| README file missing entirely | `residual_risks` blocked |

### 5. Good / Base / Bad Cases

- Good: all 7A-7E archived, CI has both jobs, production HTTP load evidence is
  uploaded, drill exists, README documents the staging boundary — gate reports
  `ready`.
- Base: README missing a boundary phrase — gate reports `warning` but still
  passes (residual risk documented in the report).
- Bad: a child task is still `planning` — gate blocks with
  `children_not_completed`.
- Bad: CI runs smoke only but omits `npm run perf:production` and
  `production-load.{json,md}` artifacts — gate blocks with
  `production_load_evidence_missing`.
- Bad: claim the system is `deployed` or `production-ready` in the README —
  the staging boundary language must remain.

### 6. Tests Required

- Unit tests (`scripts/aggregate-gate.test.mjs`): ready case against the real
  repo, blocked case (empty temp dir fails children check), markdown rendering
  (residual risks + rollback triggers), report file writing with mode 0600.
- Unit tests (`scripts/production-load.test.mjs`): metric calculation,
  threshold classification, report rendering/writing, private file modes, and
  secret-shaped content rejection.
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

## Scenario: Production HTTP Load Evidence Gate

### 1. Scope / Trigger

- Trigger: adding or changing a production-style HTTP load command, CI evidence
  capture, load report schema, load thresholds, or aggregate readiness logic.
- This command validates a running self-hosted Compose topology with
  deterministic OIDC, provider, and Chatwoot mocks. It does not prove public
  internet capacity or live SaaS/provider performance.

### 2. Signatures

```text
npm run perf:production
node scripts/production-load.mjs \
  --env-file <path> \
  --json <path> \
  --markdown <path> \
  --warmup <integer> \
  --iterations <integer> \
  --concurrency <integer> \
  --timeout-ms <integer> \
  --iteration-delay-ms <integer> \
  --max-errors <number> \
  --max-timeouts <number> \
  --max-error-rate <number> \
  --max-p95-ms <number> \
  --min-throughput <number> \
  [--no-read-probe] \
  [--keep-demo-data]
```

```js
calculateProductionHttpLoadMetrics(results, durationMs, maxObservedConcurrency)
buildProductionLoadReport(input)
writeProductionLoadReports(report, options): { jsonPath, markdownPath }
```

### 3. Contracts

- The load command must run after production smoke against the public Nginx
  edge of a live production-style stack. It checks API readiness, worker
  readiness, deterministic mock reset, OIDC operator auth, tenant/model/runtime
  seed data, policy publishing, signed Chatwoot ingress, optional operator read
  probes, and final mock Chatwoot delivery count.
- Warmup iterations use the same bounded worker pool as measured iterations
  but are excluded from measured latency, throughput, and error-rate metrics.
- Measured iterations record `iteration_index`, `status`, stable
  `error_code`, and `latency_ms` only. Reports must not persist cookies, CSRF
  tokens, webhook secrets, database URLs, provider payloads, customer-like
  text, or raw external responses.
- Reports are JSON + Markdown, written under `tmp/` by default, mode `0600`,
  with `schema_version`, `gate: production-http-load`, `status`, `scenario`,
  `thresholds`, `metrics`, `delivery`, `checks`, `iteration_results`, and an
  explicit interpretation boundary.
- Threshold breaches produce report status `blocked` and a non-zero process
  exit. Stable error output uses `production_load_failed:<reason_code>`.
- Unless `--keep-demo-data` is set, demo tenant/runtime/model/Chatwoot records
  are archived or deactivated after the run, following the production smoke
  cleanup pattern.
- The aggregate Phase 7 gate and CI full-stack job must require the production
  load command and upload both `production-load.json` and `production-load.md`
  as secret-safe evidence.

### 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| Invalid scenario integer, threshold, or CLI value | Non-zero with stable `invalid_*` / CLI reason |
| Public API or worker readiness fails | Setup check absent; command exits non-zero |
| OIDC auth cannot complete | `production_load_failed:oidc_login_failed` or `oidc_callback_failed` |
| Signed Chatwoot ingress returns non-2xx | Iteration records `error` with `http_<status>` |
| Iteration deadline expires | Iteration records `timeout` with `timeout` |
| Error/timeout/error-rate/p95/throughput threshold breached | Report status `blocked`, exit non-zero |
| Mock Chatwoot delivery count below expected successes | `chatwoot_delivery` blocked |
| Report text matches credential-shaped content | Report writing fails closed |
| CI removes command or evidence upload | Aggregate `production_http_load` blocked |

### 5. Good / Base / Bad Cases

- Good: CI profile runs warmup 2, measured 20, concurrency 4, zero allowed
  errors, p95 below 5000 ms, and uploads JSON + Markdown evidence.
- Base: local paced stress uses `--iteration-delay-ms` to stay below configured
  Nginx rate limits and validates sustained behavior without claiming public
  capacity.
- Bad: increase concurrency until Nginx returns `429` and then loosen
  thresholds to pass; rate-limit breaches are real findings and should be
  reported as blocked burst behavior.
- Bad: write raw cookies, CSRF tokens, database URLs, customer messages, or
  provider responses to evidence files.

### 6. Tests Required

- Unit: nearest-rank p50/p95/p99, throughput, success/error/timeout counts,
  threshold pass/fail checks, delivery count checks, Markdown rendering, JSON
  writing, mode `0600`, and secret scanner rejection.
- Aggregate: `scripts/aggregate-gate.test.mjs` must assert
  `production_http_load` is ready against the real repo and blocks if required
  CI/package/script evidence is absent.
- Project: run `npm run test:phase7f`, `npm run lint`, `npm run typecheck`,
  `node scripts/validate-release-readiness.mjs`, `node
  scripts/validate-phase7.mjs`, and full `npm test`.
- Runtime: when Docker/local listeners are available, boot the production
  Compose stack and run at least the CI-safe `npm run perf:production` profile.

### 7. Wrong vs Correct

#### Wrong

```sh
npm run smoke:production
# skip load evidence and still mark the aggregate gate ready
node scripts/validate-phase7.mjs
```

#### Correct

```sh
npm run smoke:production
npm run perf:production -- \
  --json tmp/ci-evidence/production-load.json \
  --markdown tmp/ci-evidence/production-load.md
node scripts/validate-phase7.mjs
```

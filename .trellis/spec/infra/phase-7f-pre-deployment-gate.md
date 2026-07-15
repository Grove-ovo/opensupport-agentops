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

## Scenario: Direct Production Provider Probe

### 1. Scope / Trigger

- Trigger: connecting a production tenant to a new OpenAI-compatible provider,
  changing provider load limits, or collecting live provider latency and usage
  evidence outside CI.
- Applies to `scripts/provider-load.mjs`, `scripts/provider-load-lib.mjs`,
  `scripts/provider-load.test.mjs`, and
  `docs/operations/provider-load-probe.md`.
- This probe measures one caller-to-provider path. It does not establish
  application, regional, or provider-wide capacity.

### 2. Signatures

```text
npm run perf:provider -- \
  --api-key-file <private-regular-file> \
  --base-url <https-openai-compatible-origin> \
  --model <model-id> \
  --json <path> \
  --markdown <path> \
  [--stages <requests@concurrency,...>] \
  [--timeout-ms <integer>] \
  [--max-tokens <integer>]
```

```js
parseProviderLoadStages(value)
parseProviderLoadOptions(argv, env)
runProviderLoad(options)
writeProviderLoadReports(report, options)
```

### 3. Contracts

- The command accepts a credential path only. It must never accept the key as
  a CLI value or environment variable.
- The key path must be a non-symlink regular file with no group/other
  permission. The key, authorization header, prompt, response content, raw
  provider error, and provider URL are excluded from reports.
- The default profile is `3@c1,6@c2,12@c4`, timeout 30 seconds, and 1500 max
  tokens. Bounds are 10 stages, 100 requests per stage, 500 requests total,
  concurrency 16, timeout 1-120 seconds, and max tokens 256-4096.
- Reports contain request status, stable error code, HTTP status, latency,
  usage counts, p50/p95/p99, throughput, stage metrics, and an explicit
  interpretation boundary. JSON and Markdown are atomic mode-`0600` files.
- Stop dispatching new requests when cumulative error rate exceeds 10%, after
  three consecutive auth/rate-limit failures, or after any timeout. In-flight
  requests may finish and remain in evidence.

### 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| Missing key path, base URL, or model | Stable `*_required` error, exit 2 |
| Key path is symlink, broad mode, unreadable, or malformed | Fail before provider I/O |
| Base URL is not HTTPS or contains user info/query/fragment | `invalid_base_url` |
| Stage or numeric bound is exceeded | Stable `invalid_*` error |
| Provider returns `401`/`403` | `auth_failed` |
| Provider returns `429` | `rate_limited` |
| Request exceeds deadline | `timeout`, stop remaining dispatch |
| Error/timeout stop threshold is reached | Report `blocked`, exit 1 |
| Report contains a shaped or exact credential | Delete reports and fail closed |

### 5. Good / Base / Bad Cases

- Good: run the default profile from the production host with a dedicated
  mode-`0600` key file and retain request-level JSON plus Markdown evidence.
- Base: the provider rate-limits the ramp; preserve the blocked report and do
  not increase concurrency or relax thresholds to force a pass.
- Bad: put the API key in shell history, an environment variable, report,
  ticket, or command argument.
- Bad: treat a successful single-host probe as a multi-region capacity claim.

### 6. Tests Required

- Unit tests cover stage/default parsing, all numeric bounds, missing key
  files, symlink and mode rejection, successful metrics, nearest-rank
  percentiles, stop thresholds, atomic private reports, and credential scans.
- Run `npm run test:provider-load`, `npm run lint`, and `npm run typecheck`.
- A live run must capture pre/post host and container health, preserve provider
  reports, and scan them against the exact key before declaring success.

### 7. Wrong vs Correct

#### Wrong

```sh
PROVIDER_API_KEY=sk-secret npm run perf:provider
```

#### Correct

```sh
npm run perf:provider -- \
  --api-key-file /run/secrets/provider_api_key \
  --base-url https://provider.example/compatible \
  --model production-model \
  --json tmp/provider-load.json \
  --markdown tmp/provider-load.md
```

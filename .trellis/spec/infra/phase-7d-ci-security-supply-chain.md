# Phase 7D CI Security Supply Chain

## 1. Scope / Trigger

Use this contract when changing the GitHub Actions CI workflow, the full-stack
boot job, the supply-chain scan/SBOM job, the ephemeral CI production
configuration generator, the Trivy vulnerability allowlist, or the production
smoke/observability scripts that CI drives.

## 2. Signatures

```text
node scripts/prepare-ci-production.mjs
node scripts/prepare-trivy-ignore.mjs
node scripts/production-mock-server.mjs          # npm run smoke:mock
node scripts/verify-production-observability.mjs # npm run verify:observability
```

```js
createProductionMockServer(options) // OIDC + provider + Chatwoot mock
prepareTrivyIgnore(allowlistPath, outputPath)
```

## 3. Contracts

- CI proves a running stack, not only Compose syntax. The `full-stack` job
  generates ephemeral secrets, runs the host preflight, boots the complete
  production Compose stack with `--wait`, then runs the authenticated
  production smoke and the Prometheus/Grafana provisioning check.
- The supply chain is verified per application image. The `supply-chain` job
  builds `opensupport-agentops-{api,worker,web}:<github.sha>` (immutable SHA
  tags), generates a Trivy JSON report, fails on unresolved CRITICAL findings,
  and emits an SPDX JSON SBOM per image.
- Critical findings fail the release gate unless explicitly time-bounded.
  `security/trivy-allowlist.json` entries require `id`, `owner`, `reason`
  (>=10 chars), and a future `expires_on`; expired or malformed entries fail
  `security:allowlist` before any scan runs.
- When a current base image removes the CRITICAL findings, delete the obsolete
  exceptions instead of renewing them. An empty, schema-valid allowlist is the
  preferred state; base-image changes still require fresh reports for API,
  Worker, and Web.
- Evidence is retained as CI artifacts and is secret-safe. Reports, compose
  state, readiness JSON, Trivy JSON, and SBOMs are uploaded; output never
  contains passwords, tokens, or secret-file contents.
- Ephemeral CI configuration is generated, never committed.
  `prepare-ci-production.mjs` writes `.env.ci.preflight`, `.env.ci.smoke`, and
  `secrets/*` with mode `0600`; `.env.ci.smoke` points OIDC/provider at the
  host-side mock so the stack is fully deterministic in CI.
- The production mock exposes deterministic endpoints: `/.well-known/openid-configuration`,
  `/authorize` (302 with `smoke-code`), `/token`, `/userinfo`,
  `/v1/chat/completions`, Chatwoot `/messages` + `/toggle_status`, and
  `/__smoke/{health,reset,state}`. The smoke authenticates via real OIDC PKCE
  before reading operator-only endpoints.
- The `full-stack` and `supply-chain` jobs run every step that captures or
  cleans up with `if: always()` so evidence is uploaded and the stack is torn
  down even on failure.

## 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| Allowlist entry expired | `expired_trivy_allowlist_entry:<id>` (non-zero) |
| Allowlist entry malformed/duplicate | `invalid_trivy_allowlist_entry` / `duplicate_trivy_allowlist_entry` |
| Unresolved CRITICAL vulnerability | Trivy step `exit-code: 1`, job fails |
| Smoke ingress/provider/delivery/worker/Dashboard fails | `full-stack` job fails with reason code |
| OIDC login/callback not 302 | `oidc_login_failed` / `oidc_callback_failed` |
| Evidence dir empty | `if-no-files-found: error` fails the upload step |

## 5. Good / Base / Bad Cases

- Good: matrix builds immutable SHA tags, allowlist validates time-bounded
  exceptions, full-stack smoke authenticates and proves end-to-end delivery,
  all evidence uploads secret-safe artifacts.
- Base: no unresolved critical findings and an empty allowlist — the gate
  passes with zero exceptions tracked.
- Bad: commit `.env.ci.*` or `secrets/*`; tag images with `:latest`; silence
  critical findings by editing the allowlist without owner/reason/expiry;
  print the generated postgres password to the job log.

## 6. Tests Required

- `scripts/phase7d.test.mjs` covers ephemeral config generation (private
  modes, deterministic issuer, no secret in stdout) and allowlist expiry
  rejection.
- `npm run test:release` confirms CI still contains the required quality
  commands and `.gitignore` covers generated CI artifacts.
- Full `npm test` chain passes (the `test` script includes `test:phase7d`).

## 7. Wrong vs Correct

### Wrong

```sh
docker tag opensupport-agentops-api:latest
# silence a CVE by deleting it from the report
```

### Correct

```sh
docker build -t opensupport-agentops-api:${GITHUB_SHA} .
npm run security:allowlist   # validates time-bounded exceptions
```

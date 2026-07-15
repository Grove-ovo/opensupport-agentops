# Production API Connection And Load Test

## Goal

Connect the deployed AgentOps tenant to the user's OpenCode Zen
OpenAI-compatible API, complete a real Chatwoot -> AgentOps -> provider ->
Chatwoot flow, and run bounded production load tests with secret-safe raw data
and summary reports persisted on both the server and in the repository.

## What I Already Know

- Production runs on `159.223.183.148` behind Caddy at
  `agentops.grove.engineer`, `auth.grove.engineer`, and
  `chatwoot.grove.engineer`.
- The isolated production test tenant is
  `061fcbce-07ed-4fc0-bdaf-832d20848972` (`prod-e2e`).
- Keycloak OIDC, the AgentOps dashboard, Chatwoot login, and Chatwoot API have
  passed real browser/API checks.
- Chatwoot Inbox HMAC was synchronized with AgentOps; a real event now reaches
  canonical storage and currently stops at `model_config_unavailable`.
- The supplied endpoint is OpenAI-compatible at
  `https://opencode.ai/zen/v1/chat/completions` using model
  `deepseek-v4-flash-free`.
- A direct server-side provider probe returned HTTP 200 with usage data. A
  16-token probe spent all completion tokens on reasoning, so runtime calls
  require the application's existing 1000/1500-token limits.
- The credential is stored only as
  `/opt/opensupport-agentops/secrets/opencode_api_key`, mode `0600`.
- The credential was pasted into chat and must be rotated after testing.

## Assumptions

- Register a new provider key named `opencode` rather than replacing the
  existing `openai` origin.
- The free model is recorded with zero input/output price; token usage and
  latency are still measured.
- Keep labeled test data for evidence, but archive the AgentOps tenant after
  the run unless it is needed for follow-up debugging.
- Use bounded staged load rather than an unbounded saturation attack against a
  third-party free endpoint.

## Requirements

- Never persist or print the provider API key, authorization header, cookies,
  session tokens, webhook secret, database URL, or raw provider response.
- Add `opencode` to `AGENTOPS_PROVIDER_BASE_URLS_JSON` and add the test model to
  `AGENTOPS_MODEL_PRICING_JSON` without removing existing entries.
- Encrypt the tenant provider credential using the existing AgentOps master
  key and persist only the encrypted model-config reference.
- Publish a small test policy and retain the existing E2E Chatwoot inbox,
  contact, conversation, order fixture, and labeled messages.
- Verify one complete real message flow, including provider call, tool result,
  Shadow private-note delivery, trace, LLM call log, cost/usage, and dashboard.
- Run direct provider latency probes and production application load in staged
  concurrency levels with explicit stop thresholds.
- Capture before/after health, Docker CPU/memory, Prometheus, PostgreSQL,
  Redis, API/worker logs, HTTP latency/error/timeout metrics, and delivery
  counts.
- Persist secret-safe JSON, Markdown, and command metadata with mode `0600`.

## Load Profile

1. Functional: one provider probe and one signed Chatwoot event.
2. Provider baseline: 3 requests at concurrency 1.
3. Provider ramp: 6 requests at concurrency 2, then 12 at concurrency 4.
4. Application sustained gate: repository production load profile, paced to
   remain within the configured Chatwoot ingress rate limit.
5. Application burst gate: bounded burst used to confirm rate limiting and
   recovery; HTTP 429 is recorded as protection behavior, not hidden.

Automatic stop conditions:

- provider/application error rate exceeds 10%;
- three consecutive provider authentication or rate-limit failures;
- request timeout exceeds 30 seconds;
- host memory exceeds 85%, swap grows materially, or a core container becomes
  unhealthy/restarts;
- PostgreSQL/Redis readiness fails.

## Acceptance Criteria

- [x] Provider origin and zero-price model configuration pass production preflight.
- [x] Tenant API key is encrypted and plaintext remains only in the mode-0600 server secret file.
- [x] Real Chatwoot event creates a completed trace and a private Shadow note.
- [x] Provider calls record model, usage, latency, status, and zero estimated cost without secret leakage.
- [x] Direct provider staged load completes or records a clear external rate limit.
- [x] Production application load writes JSON/Markdown reports and threshold status.
- [x] API, worker, PostgreSQL, Redis, Keycloak, Chatwoot, Prometheus, and Grafana remain healthy after load.
- [x] Test data IDs and final disposition are recorded.
- [x] Evidence exists on the server and under `reports/production-e2e/` locally.
- [x] Credential-shaped content scan passes for all reports.

## Definition Of Done

- Real E2E and bounded load have run against the deployed public origins.
- Raw evidence and a concise interpretation are stored with timestamps.
- Any failed threshold is reported as a finding, not relaxed to force a pass.
- Production secrets are not committed or included in evidence.
- Rollback/recovery state is verified after testing.

## Out Of Scope

- Unbounded denial-of-service or destructive saturation testing.
- Multi-region performance claims from a single US origin.
- Testing from mainland China without an external probe host in that network.
- Promoting the test tenant or Chatwoot inbox into customer production use.

## Technical Notes

- `apps/api/src/provider.ts` appends `/v1/chat/completions` to provider origins.
- `scripts/production-load.mjs` and `scripts/production-load-lib.mjs` define the
  existing secret-safe production HTTP load evidence contract.
- `.trellis/spec/infra/phase-7f-pre-deployment-gate.md` defines load metrics,
  thresholds, report schema, and interpretation limits.
- `.trellis/spec/infra/phase-6e-production-operations.md` defines production
  health, secret, backup, and recovery requirements.

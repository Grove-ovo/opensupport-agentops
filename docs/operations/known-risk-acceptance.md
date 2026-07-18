# Known-Risk Acceptance & Closed-Loop Ledger

**Purpose.** A single "current truth" record of every security/quality finding
raised in review, its disposition (fixed / accepted / deferred), and — for items
we chose **not** to fix — the reason and compensating control. This removes the
need to re-excavate the history at each review.

**Maintenance rule.** Every finding from a review or audit gets a row here with a
decision. "Fixed" rows cite the commit/branch or code location that closes them.
"Accepted" rows must name a compensating control and a review trigger.

Last updated: **2026-07-18** (branch `fix/ssrf-allowlist-and-quality-hardening`).

---

## 1. Closed-loop tracking — 2026-06-27 pre-launch full check

Source: `deliverables/gstack/pre-launch-check-agentops-2026-06-27.md`
(which consolidates `reports/CODE_REVIEW_REVISION_2026-06-26.md`,
`security-audit-report.md`, and the 06-27 QA report).

| # | Sev | Finding | Decision | Status | Evidence |
|---|-----|---------|----------|--------|----------|
| 1 | 🔴 | Output PII gate missing CN ID / intl phone / bank-card Luhn | Fix | ✅ Closed | `packages/guardrails` reuses `maskPII`; verified in prior review |
| 2 | 🔴 | `safeEqual` leaks CSRF token length on mismatch | Fix | ✅ Closed | `apps/api/src/operator-auth.ts:246` now `timingSafeEqual(rightBuffer, rightBuffer)` |
| 3 | 🟡 | Postgres bound on all interfaces / Redis no password | Fix | ✅ Closed | `infra/docker/compose.phase1.yml` binds `127.0.0.1:` + Redis `--requirepass` |
| 4 | 🟡 | **SSRF: IP blacklist bypassable by domain rebinding; http allowed** | Fix | ✅ Closed | This branch: `packages/shared/src/chatwoot-url.ts` allowlist + `requireHttps`; wired via `AGENTOPS_CHATWOOT_BASE_URL_ALLOWLIST` / `AGENTOPS_CHATWOOT_REQUIRE_HTTPS` |
| 5 | 🟡 | Approval deliver-before-persist race (different idempotency keys) | Accept (mitigated) | 🟡 Closed w/ residual → R-1 | Row lock held across delivery; rationale in `../adr/ADR-003-approval-delivery-locking.md` |
| 6 | 🟡 | `AGENTOPS_COOKIE_SECURE=false` | Fix | ✅ Closed | `apps/api/src/config.ts:166` defaults to `true` |
| 7 | 🟡 | Integration/E2E not run (no Postgres+Redis) | Fix | ✅ Closed | CI `full-stack` job boots the production Compose stack and runs authenticated smoke + load |
| 8 | 🟡 | CI `full-stack` used `continue-on-error: true` | Fix | ✅ Closed | Removed from `full-stack`; the only remaining `continue-on-error` is the **new non-blocking coverage job** (intentional, see D-3) |
| 9 | 🟢 | secrets files at 0644 | Fix | ✅ Closed | `secrets/*` now `0600` |
| 10 | 🟢 | Tool results unmasked into LLM prompt | Fix | ✅ Closed | Confirmed fixed in re-review |
| 11 | 🟢 | Delivery catch block swallowed errors without logs | Fix | ✅ Closed | Confirmed fixed in re-review |

**Result:** all 11 findings are closed. #5 is closed *with an accepted residual*
tracked as **R-1** below; #4 (the only "said-we'd-fix-but-hadn't" item) is now
fully closed on this branch.

---

## 2. Accepted residual risks (decided NOT to fully eliminate now)

| ID | Risk | Why accepted | Compensating control | Review trigger |
|----|------|--------------|----------------------|----------------|
| R-1 | Approval **commit-after-deliver** window: if delivery succeeds but the following `COMMIT` fails, a retry with a *different* idempotency key could double-send | Requires a commit failure **and** a key change; chosen over CAS-first because a silently dropped reply is worse than a retryable one | FOR UPDATE lock serializes concurrent approvals; same-key retries de-dupe at Chatwoot; documented in ADR-003 | Move to outbox/two-phase delivery if duplicate-reply incidents appear or sync-latency SLAs are added |
| R-2 | SSRF allowlist is **operator-configured**, not enforced by default | The gate is only strong if `AGENTOPS_CHATWOOT_BASE_URL_ALLOWLIST` is populated in production; empty allowlist falls back to the IP-blacklist baseline | `AGENTOPS_CHATWOOT_REQUIRE_HTTPS` defaults to `true`; private-host blacklist always applies; `.env.production.example` ships a non-empty allowlist example | Make a non-empty allowlist a hard startup requirement in production if any tenant onboards an untrusted base URL |

---

## 3. Deferred debt (non-urgent, tracked)

| ID | Item | Decision | Plan |
|----|------|----------|------|
| D-3 | No enforced test-coverage threshold | Baseline added, non-blocking | `c8` baseline wired (`.c8rc.json`, `npm run coverage`, CI `coverage` job with `continue-on-error`). Current: ~72% lines. Raise `check-coverage` to enforced in a follow-up. |
| D-4 | Phase-staged validator scaffolding (43 `validate-phaseN.mjs`, 60+ serial `test` chain) | Defer | Remediation plan in `../test_topology_debt.md` |

---

## References

- Full check: `../../deliverables/gstack/pre-launch-check-agentops-2026-06-27.md`
- Code review: `../../reports/CODE_REVIEW_2026-06-26.md`, `../../reports/CODE_REVIEW_REVISION_2026-06-26.md`
- Security audit: `../../security-audit-report.md`
- ADR-003 (approval locking): `../adr/ADR-003-approval-delivery-locking.md`
- Reports index (current truth): `../../reports/README.md`

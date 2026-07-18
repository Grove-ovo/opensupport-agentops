# Reports Index — Current Truth

This is the single entry point for "how healthy is the system right now?".
Instead of reading a dozen dated files, start here: the **Latest** column always
points at the most recent authoritative artifact for each area. Update the
pointers in this file whenever a newer report supersedes an old one.

> Convention: dated reports are immutable snapshots. This index is the mutable
> "latest" pointer over them. When you add a newer report, update the row here
> and leave the old file in place for history.

---

## 🟢 Start here — current system health

| Area | Latest (current truth) | Date | Verdict |
|------|------------------------|------|---------|
| **End-to-end production run** | [`production-e2e/20260714T113621Z/summary.md`](production-e2e/20260714T113621Z/summary.md) | 2026-07-14 | Full stack booted; authenticated smoke + load + observability captured |
| **Pre-launch full check** | [`../deliverables/gstack/pre-launch-check-agentops-2026-06-27.md`](../deliverables/gstack/pre-launch-check-agentops-2026-06-27.md) | 2026-06-27 | 🟡 Conditional Go — all 11 findings now closed (see ledger) |
| **Open risks & closed-loop status** | [`../docs/operations/known-risk-acceptance.md`](../docs/operations/known-risk-acceptance.md) | 2026-07-18 | Living ledger of fixed / accepted / deferred |

The `production-e2e/<timestamp>/` directory is the richest health evidence: it
contains `summary.md`, readiness probes, load results, Prometheus scrapes, and
secret-safe container state for one full run. **Latest run: `20260714T113621Z`.**

---

## By area

### Code review & security
- [`CODE_REVIEW_2026-06-26.md`](CODE_REVIEW_2026-06-26.md) — initial review
- [`CODE_REVIEW_REVISION_2026-06-26.md`](CODE_REVIEW_REVISION_2026-06-26.md) — re-review after fixes
- [`FIX_REQUIRED_2026-06-26.md`](FIX_REQUIRED_2026-06-26.md) — required-fix list
- [`security_eval_report.md`](security_eval_report.md) — security eval suite
- [`../security-audit-report.md`](../security-audit-report.md) — OWASP/STRIDE audit

### Deployment & integration
- [`server_deployment_validation_2026-07-06.md`](server_deployment_validation_2026-07-06.md)
- [`industrial_test_report_2026-07-06.md`](industrial_test_report_2026-07-06.md)
- [`industrial_deployment_performance_report_2026-07-07.md`](industrial_deployment_performance_report_2026-07-07.md)
- [`real_integration_profile_report_2026-07-07.md`](real_integration_profile_report_2026-07-07.md)
- [`cloudflare_temporary_deploy_2026-07-06.md`](cloudflare_temporary_deploy_2026-07-06.md)
- [`phase1a_database_verification.md`](phase1a_database_verification.md)

### Performance & load
- [`load_test_report.md`](load_test_report.md)
- [`benchmark_report.md`](benchmark_report.md)

### Eval & quality
- [`eval_report.md`](eval_report.md)
- [`rag_eval_baseline.md`](rag_eval_baseline.md)
- [`failure_analysis.md`](failure_analysis.md)

### Cost
- [`cost_report.md`](cost_report.md)

---

## Related living docs (not point-in-time reports)

- **Operations runbooks:** [`../docs/operations/`](../docs/operations/) — deploy,
  incident response, credential rotation, backup/restore.
- **Coverage baseline:** run `npm run coverage` → `coverage/` (lcov +
  `coverage-summary.json`); CI publishes it as the `coverage-<sha>` artifact.
- **Architecture decisions:** [`../docs/adr/`](../docs/adr/).

# OpenSupport AgentOps Proof Pack

This page is for technical buyers evaluating the USD 12,000 Agent Memory
Reliability Sprint or the USD 15,000 OpenSupport AgentOps Pilot.

It links the commercial offer to concrete repository evidence. The repository is
not a hosted SaaS and does not claim live production traffic. It is a
production-style proof point: deterministic evals, guarded runtime modes,
operator approval, trace snapshots, release gates, and deployment runbooks.

## What This Repository Proves

| Buyer question | Repository evidence | Why it matters |
| --- | --- | --- |
| Can risky agent behavior be replay-tested? | `eval/eval_cases.jsonl`, `reports/eval_report.md` | Shows a committed replay dataset and gate report rather than ad hoc demo prompts. |
| Are security failures tested separately? | `eval/security_eval_cases.jsonl`, `reports/security_eval_report.md` | Covers approval bypass, credentials, PII, prompt injection, retrieval injection, unauthorized access, and unsafe tools. |
| Are side effects controlled? | `docs/runtime_modes.md`, `docs/approval_flow.md`, `packages/runtime-*`, `packages/approvals` | Separates shadow, assist, and auto modes with approval snapshots and human edit tracking. |
| Can outputs be traced? | `docs/trace_schema.md`, `docs/llm_observability.md`, `reports/failure_analysis.md` | Uses immutable execution snapshots and failure buckets for review. |
| Is cost visible? | `docs/cost_governance.md`, `reports/cost_report.md` | Separates configured budget from deterministic estimated cost. |
| Is rollout gated? | `docs/release_gate.md`, `reports/eval_report.md`, `reports/security_eval_report.md` | Promotion can stay in shadow when gates fail. |
| Is deployment operationalized? | `docs/operations/deployment-runbook.md`, `docs/operations/backup-restore.md`, `docs/operations/incident-response.md`, `docs/operations/credential-rotation.md` | Demonstrates runbook discipline beyond local demos. |
| Is there a dashboard path? | `docs/operations_dashboard.md`, `apps/web` | Provides an operator surface for traces, approvals, releases, and tenant/model config. |

## Current Committed Evidence

| Evidence | Current repository artifact |
| --- | --- |
| Replay dataset | `eval/eval_cases.jsonl` |
| Security dataset | `eval/security_eval_cases.jsonl` |
| Replay report | `reports/eval_report.md` |
| Security report | `reports/security_eval_report.md` |
| Failure analysis | `reports/failure_analysis.md` |
| Architecture benchmark | `reports/benchmark_report.md` |
| Load report | `reports/load_test_report.md` |
| Cost report | `reports/cost_report.md` |
| Industrial test report | `reports/industrial_test_report_2026-07-06.md` |
| Deployment runbook | `docs/operations/deployment-runbook.md` |
| Production preflight | `docs/operations/deploy-preflight.md` |

## Reproduction Commands

Local deterministic checks:

```bash
npm ci
npm run typecheck
npm run reports:phase4:check
npm run reports:phase5:check
npm run test:release
```

Production-style preflight:

```bash
cp .env.production.example .env.production
# Replace placeholder secrets before using this outside local validation.
npm run deploy:preflight
```

Cloudflare temporary preview harness:

```bash
npm run test:cloudflare:temporary
```

## How This Maps To The USD 12,000 Sprint

The Agent Memory Reliability Sprint applies the same operating discipline to
one buyer workflow:

1. Map memory write and recall boundaries.
2. Define a memory taxonomy.
3. Threat-model stale memory, permission drift, secrets, PII, contradictions,
   and cross-agent contamination.
4. Write 8-12 replay tests.
5. Build a scorecard and implementation path.
6. Optionally prototype a bounded patch when repo access is available.

Repository analogues:

- replay tests -> `eval/eval_cases.jsonl`,
- security cases -> `eval/security_eval_cases.jsonl`,
- release gate -> `docs/release_gate.md`,
- trace review -> `docs/trace_schema.md`,
- operator approval -> `docs/approval_flow.md`.

## How This Maps To The USD 15,000 Pilot

The OpenSupport AgentOps Pilot uses the same components for one ecommerce
support workflow:

1. Connect or plan the support workflow.
2. Run in shadow or assist mode first.
3. Install replay/security evals.
4. Add guardrails and approval rules.
5. Measure cost and rollout readiness.
6. Produce a go/no-go rollout plan.

Repository analogues:

- Chatwoot contracts -> `packages/chatwoot`,
- runtime modes -> `docs/runtime_modes.md`,
- approvals -> `packages/approvals`,
- cost governance -> `docs/cost_governance.md`,
- deployment -> `infra/docker` and `docs/operations`.

## Honest Limits

- This repository is not a complete public SaaS.
- It is not a formal compliance certification.
- Deterministic reports use committed fixtures unless explicitly marked as live
  integration evidence.
- Real buyer work still needs workflow-specific data handling, acceptance
  criteria, and environment access.

## Commercial Links

- [Buyer deal room](./buyer-deal-room.md)
- [Agent Memory Reliability Sprint](./agent-memory-reliability-sprint.md)
- [OpenSupport AgentOps Pilot](./opensupport-agentops-pilot.md)
- [Sample sprint report](./sample-memory-sprint-report.md)
- [Buyer due diligence](./buyer-due-diligence.md)

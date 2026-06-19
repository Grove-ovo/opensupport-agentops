---
artifact: prd
version: "1.0"
created: 2026-06-19
status: accepted
source: ../../../OpenSupport_AgentOps_PRD.md
---

# PRD: Phase 4 - Eval + Release Gate

## Goal

Turn immutable Phase 1-3 traces, pipeline proposals, runtime decisions, and
version snapshots into reproducible replay/security evaluation runs and a
blocking release gate for controlled Shadow, Assist, and Auto promotion.

## Requirements

- Provide at least 150 versioned replay cases and 40 versioned security cases.
- Keep dev, test, and regression splits explicit and deterministic.
- Run replay cases through an injected candidate evaluator without performing
  Chatwoot delivery, approval actions, or mutable commerce side effects.
- Calculate task success, high-risk escalation recall, unsafe action rate,
  no-evidence answer rate, retrieval Recall@5, p95 latency, and cost per ticket.
- Security evaluation must cover prompt injection, approval bypass, credential
  requests, system prompt requests, unauthorized order access, retrieval
  injection, unsafe tools, and output PII leakage.
- Any P0 security failure, unsafe action, PII leak, or unauthorized order
  access must block Auto promotion.
- Release candidates must freeze agent, prompt, policy, tool, risk, retrieval,
  and model versions plus the exact eval run IDs used by the gate.
- Enforce `draft -> evaluating -> failed|shadow|assist|auto -> archived`
  transitions through application guards and PostgreSQL constraints.
- Release Gate must emit one immutable decision per required check and derive
  the maximum permitted promotion state.
- Materialize failed eval cases into stable failure buckets without customer,
  credential, prompt, evidence, or provider payloads.
- Generate `reports/eval_report.md`, `reports/security_eval_report.md`, and
  `reports/failure_analysis.md` from deterministic fixtures.

## Acceptance Criteria

- [ ] AC-1: `eval/eval_cases.jsonl` contains at least 150 valid unique replay
  cases and `eval/security_eval_cases.jsonl` contains at least 40.
- [ ] AC-2: Dataset parsing rejects invalid IDs, duplicate cases, invalid
  splits, incomplete expected outcomes, and unsafe plaintext secrets.
- [ ] AC-3: Replay Eval calculates all source-PRD quality, grounding, latency,
  regression, and cost metrics deterministically.
- [ ] AC-4: Security Eval reports P0 pass/fail and zero-tolerance unsafe tool,
  PII leak, and unauthorized-access rates.
- [ ] AC-5: Identical eval run retries return one immutable run; conflicting
  idempotency input is rejected.
- [ ] AC-6: Release candidates use immutable snapshots and valid expected-state
  transitions in TypeScript and PostgreSQL.
- [ ] AC-7: Release Gate blocks Auto when any P0 security result fails and
  applies all PRD promotion thresholds.
- [ ] AC-8: Promotion decisions cannot reference mutable config or incomplete,
  mismatched, or failed eval runs.
- [ ] AC-9: Failure buckets retain stable reason codes and trace/eval/release
  references without sensitive payloads.
- [ ] AC-10: All six Phase 4 child tasks are archived, linked, and pass the
  parent integration validator, full tests, migrations, and live DB checks.

## Child Task Plan

| Task | Scope | Dependency |
|------|-------|------------|
| Phase 4A | Shared eval contracts, 150/40 datasets, loader, DB foundation | Phase 3 |
| Phase 4B | Replay Eval runner, metrics, immutable run results | 4A |
| Phase 4C | Security Eval runner, P0 and zero-tolerance safety metrics | 4A |
| Phase 4D | Release candidate snapshot/state machine and persistence | 4A |
| Phase 4E | Release Gate decisions and controlled promotion | 4B-4D |
| Phase 4F | Failure buckets, reports, and parent integration validation | 4B-4E |

## Technical Approach

Use a new `packages/eval` TypeScript package with project-owned contracts.
Evaluation adapters receive immutable case and candidate snapshots and return
normalized observations. Dataset loading, metrics, security classification,
release state transitions, gate decisions, and failure bucketing remain pure
or in-memory-testable; PostgreSQL functions enforce the persistent state and
append-only audit boundaries.

No external eval platform or workflow engine is introduced. Static fixture
runs generate the required reports, while provider-backed evaluation remains
an injected adapter for later environments.

## Decision (ADR-lite)

**Context**: Phase 4 needs reproducible release decisions without coupling
tests to live LLM providers or mutable tenant configuration.

**Decision**: Version datasets and candidate snapshots, inject execution
adapters, persist immutable run/results/gates, and use deterministic metric and
state-transition code.

**Consequences**: Local and CI checks are stable and auditable. Real provider
quality remains adapter-dependent, but it cannot bypass the same normalized
metrics and release thresholds.

## Definition of Done

- All six child tasks are committed, checked, archived, and merged to `dev`.
- Dataset counts and schemas are statically validated.
- Lint, type-check, package tests, and full tests pass.
- New migrations run twice and live PostgreSQL verification passes.
- Required reports exist and are generated from committed fixtures.
- Parent integration validation passes before and after archive.

## Out of Scope

- Phase 5 benchmark comparison and load testing.
- Eval/Release dashboard UI.
- Live production promotion, canary traffic shifting, or deployment control.
- External eval SaaS, workflow engine, or secret manager.
- LLM-as-judge as the only authority for P0 safety decisions.

## References

- `OpenSupport_AgentOps_PRD.md`
- `docs/architecture.md`
- `docs/adr/ADR-002-controlled-launch-architecture.md`
- `research/phase4-boundary-analysis.md`

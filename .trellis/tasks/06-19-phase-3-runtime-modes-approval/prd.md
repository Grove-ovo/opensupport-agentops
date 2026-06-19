---
artifact: prd
version: "1.0"
created: 2026-06-19
status: accepted
source: ../../../OpenSupport_AgentOps_PRD.md
---

# PRD: Phase 3 - Runtime Modes + Approval

## Goal

Turn Phase 2 response proposals into controlled Shadow, Assist, or Auto
outcomes using explicit ticket and approval state machines, immutable approval
snapshots, idempotent Chatwoot delivery, and auditable human actions.

## Requirements

- Enforce `TicketExecution` transitions through application guards and
  PostgreSQL constraints.
- Keep the trace's requested runtime mode immutable and record every effective
  mode, downgrade, action, and reason separately.
- Shadow writes a Chatwoot private note only.
- Assist creates one immutable pending approval and performs no public delivery
  before an approved or edited terminal action.
- Auto sends a public reply only for allowed low-risk outcomes with valid
  grounding and no blocking gate, budget, latency, or security reason.
- Any uncertain or blocking outcome deterministically downgrades to Assist,
  Shadow, or handoff.
- Approval snapshots preserve suggested reply, evidence refs, tool result refs,
  risk reason, generated action, expiry, and immutable version context.
- Approval actions support approve, edit, reject, escalate, and expire with
  actor audit and deterministic edit distance.
- Chatwoot private/public delivery is tenant scoped, idempotent, retry aware,
  and separately audited from pipeline generation.
- Phase 3 continues the Phase 2 proposal-only boundary: generation does not
  perform delivery; a runtime orchestrator owns side effects.

## Acceptance Criteria

- [ ] AC-1: Invalid ticket execution transitions are rejected in TypeScript and
  PostgreSQL.
- [ ] AC-2: Shadow produces one private note and never a public reply.
- [ ] AC-3: Assist creates one pending approval with an immutable snapshot and
  enters `waiting_approval`.
- [ ] AC-4: Approve/edit can produce one guarded public reply; reject,
  escalate, and expire cannot later send that reply.
- [ ] AC-5: Auto sends only allowed low-risk grounded replies and records the
  effective mode/action decision.
- [ ] AC-6: P0 risk, missing evidence/tool grounding, timeout, or budget failure
  prevents Auto and records a stable downgrade reason.
- [ ] AC-7: Duplicate runtime or approval commands do not duplicate Chatwoot
  messages, approvals, or transition audit rows.
- [ ] AC-8: Human edits preserve original and edited text and record a
  deterministic edit distance.
- [ ] AC-9: Every delivery and approval action is tenant/trace scoped and
  auditable without persisting credentials.
- [ ] AC-10: Phase 3A through Phase 3F remain independently executable Trellis
  tasks and pass the parent integration validator.

## Child Task Plan

| Task | Scope | Dependency |
|------|-------|------------|
| Phase 3A | Execution state contracts, transition guard, migration, audit | Phase 2 |
| Phase 3B | Runtime mode config and deterministic action/downgrade engine | 3A |
| Phase 3C | Idempotent Chatwoot private-note/public-reply delivery | 3A |
| Phase 3D | Immutable approval snapshot persistence and pending creation | 3A, 3B |
| Phase 3E | Approval terminal actions, edit tracking, approved delivery | 3C, 3D |
| Phase 3F | End-to-end runtime/approval orchestration and acceptance gate | 3B-3E |

## Current Execution Focus

Phase 3A only:

- shared state and transition contracts
- deterministic transition guard
- `ticket_execution_transitions` append-only audit
- PostgreSQL transition enforcement and live verification
- no Chatwoot delivery and no approval creation

## Technical Approach

Use application services plus PostgreSQL state fields, not a workflow engine.
Each transition requires an expected current state and an idempotency key.
Runtime action decisions remain pure and side-effect free. Chatwoot delivery
and approval persistence are injected adapters invoked only by the Phase 3
orchestrator.

## Decision (ADR-lite)

**Context**: Phase 2 generates grounded proposals but intentionally cannot send
messages or create approvals.

**Decision**: Add a separate runtime layer with state guards, immutable
snapshots, idempotent commands, and isolated delivery adapters.

**Consequences**: Runtime behavior is replayable and auditable. The MVP avoids
a workflow engine, but commands and database transitions require stricter
expected-state and idempotency contracts.

## Out of Scope

- Replay Eval, Security Eval, Release Gate, and release promotion.
- Monitor Agent and failure-bucket materialization.
- Approval Queue frontend and complete dashboard UI.
- Full SaaS user accounts, RBAC, SSO, and public registration.
- Real refund execution or high-risk commerce mutations.
- Real Shopify, WooCommerce, Taobao, or JD adapters.
- External workflow engine or secret manager.

## Definition of Done

- All six child tasks are archived and linked.
- Lint, type-check, package tests, and full tests pass.
- New migrations run twice and live PostgreSQL verification passes.
- Chatwoot delivery and approval flows have idempotency tests.
- `docs/runtime_modes.md` and `docs/approval_flow.md` exist.
- Parent integration validation passes before and after archive.

## References

- `OpenSupport_AgentOps_PRD.md`
- `docs/architecture.md`
- `docs/adr/ADR-002-controlled-launch-architecture.md`
- `research/phase3-boundary-analysis.md`

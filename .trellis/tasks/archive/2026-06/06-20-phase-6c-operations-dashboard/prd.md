# Phase 6C: Operations Dashboard

## Goal

Provide a production-built operator dashboard for monitoring AgentOps and
completing approval, release, and tenant configuration workflows.

## Requirements

- Add a React and Vite `apps/web` workspace.
- Implement a compact operations shell with Overview, Traces, Approvals,
  Releases, and Settings views.
- Add API endpoints required for dashboard aggregation, pagination, approval
  actions, release transitions, and tenant/model configuration changes.
- Show trace state, runtime mode, gates, latency, cost, evidence references, and
  final action without exposing secrets or raw provider payloads.
- Preserve approval snapshot semantics and require explicit confirmation for
  public reply or release promotion actions.
- Provide loading, empty, error, stale, and unavailable states.
- Build responsive layouts for desktop and mobile.
- Establish actual frontend Trellis conventions based on the implementation.

## Acceptance Criteria

- [x] Operators can inspect traces and filters.
- [x] Operators can approve, edit, reject, or escalate pending approvals.
- [x] Operators can inspect release gate results and perform allowed transitions.
- [x] Operators can edit non-secret tenant/model settings and replace secrets
      without reading existing plaintext.
- [x] UI tests and browser E2E cover primary workflows and failure states.
- [x] Production assets build and are ready for the Phase 6E reverse proxy.
- [x] Desktop and mobile screenshots have no overlap or clipped controls.

## Out Of Scope

- Public signup, billing, and full RBAC.
- Marketing pages.

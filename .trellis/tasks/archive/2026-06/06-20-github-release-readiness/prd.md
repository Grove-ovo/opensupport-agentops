# PRD: GitHub Release Readiness

## Goal

Prepare the completed Phase 1-5 implementation for a private GitHub repository
without overstating production readiness or publishing secrets.

## Requirements

- Replace the Phase 1-only README with an accurate Phase 1-5 project overview.
- Document local setup, validation commands, reports, branch policy, and known
  product boundaries.
- Remove links that point to archived tasks as if they were active.
- Add the MIT license declared by `package.json`.
- Add GitHub Actions CI for pushes to `main`/`dev` and pull requests.
- CI must install with `npm ci`, then run type-check, lint, and the full test
  chain on Node 22.
- Confirm no real environment files, credentials, private keys, build output,
  or dependencies are tracked.
- Merge the verified `dev` branch into stable `main`.
- Create a private `Grove-ovo/opensupport-agentops` repository, configure
  `origin`, and push `main` and `dev`.

## Acceptance Criteria

- [x] README describes completed capabilities and explicit non-production
  boundaries.
- [x] README links to architecture, ADRs, eval datasets, and all generated
  reports without broken active-task assumptions.
- [x] `LICENSE` contains the MIT license for Grove-ovo.
- [x] GitHub CI runs the repository quality chain on Node 22.
- [x] Secret and tracked-file scans find no release blocker.
- [x] `npm run typecheck`, `npm run lint`, and `npm test` pass.
- [x] `main` contains the verified `dev` history.
- [x] Private GitHub remote is configured and `main`/`dev` are pushed.

## Technical Approach

Keep `dev` as the integration branch and `main` as the stable release branch.
Create release-readiness changes on `feat/github-release-readiness`, merge them
to `dev`, rerun checks, then merge `dev` to `main`. Use GitHub CLI only after
interactive authentication succeeds.

## Decision (ADR-lite)

**Context**: The implementation is complete through deterministic Phase 5
benchmarks, but there is no production HTTP service, live provider benchmark,
or dashboard UI.

**Decision**: Publish as a private reference implementation and describe its
boundaries explicitly. CI validates deterministic code and reports but does
not claim production deployment readiness.

**Consequences**: The repository is reviewable and reproducible while live
provider, Chatwoot end-to-end, HTTP capacity, and UI work remain future tasks.

## Out of Scope

- Public repository visibility.
- GitHub release/tag creation.
- Production deployment or hosted demo.
- Live provider, Chatwoot, or commerce-system integration tests.
- Completing the unused frontend bootstrap guideline task.

## Technical Notes

- Current stable implementation: `dev` at Phase 5 completion.
- Local runtime: Node 22.22.3 and npm 10.9.8.
- Official action examples checked on 2026-06-20:
  `actions/checkout@v7` and `actions/setup-node@v6`.

# GitHub CI Green Remediation

## Goal

Restore the `dev` GitHub Actions workflow to a completely green state without
weakening supply-chain, browser, full-stack, or quality gates.

## What I Already Know

- CI run `29407900307` for commit `eea0155` completed with failure.
- `quality` and `full-stack` passed.
- All three supply-chain matrix jobs failed before image build in
  `npm run security:allowlist`.
- Local reproduction reports
  `expired_trivy_allowlist_entry:CVE-2023-45853`; all three committed entries
  expired on `2026-07-13`.
- The GitHub browser job failed with exit code 1, but the same commit passes
  `npm run test:web:e2e` locally with 10/10 tests.
- GitHub CLI is not authenticated. Public Checks APIs and SSH push work, but
  administrator-only raw job logs and manual reruns are unavailable.
- `dump.rdb` is unrelated user data and must not be read, modified, staged, or
  committed.

## Assumptions

- A new push to `dev` is the supported way to rerun all CI jobs.
- API and Worker will move to `node:22-alpine` with explicit UID/GID 999 after
  current scans showed zero CRITICAL findings versus four unfixed CRITICAL
  findings in current `node:22-slim`.
- All expired CVE exceptions will be removed rather than renewed.
- Browser configuration should only change if the failure reproduces or a new
  CI run confirms a recurring CI-only failure.

## Research References

- [`research/base-image-vulnerability-review.md`](research/base-image-vulnerability-review.md)
  records current-image Trivy evidence and the Alpine migration decision.

## Requirements

- Rebuild and scan API, Worker, and Web production images with current base
  images before changing the allowlist.
- Remove obsolete exceptions or renew only evidence-backed unresolved entries.
- Keep the allowlist time-bounded and preserve fail-closed validation.
- Run security allowlist validation, browser E2E, lint, typecheck, targeted
  tests, and the full test chain locally.
- Push a scoped fix to `origin/dev` and monitor the resulting workflow until
  every job concludes successfully.
- Do not disable jobs, relax Trivy severity, change `if-no-files-found: error`,
  hide browser failures, or force-push.

## Acceptance Criteria

- [ ] `npm run security:allowlist` succeeds with reviewed entries.
- [ ] Current production images have fresh Trivy evidence for HIGH/CRITICAL findings.
- [ ] `npm run test:web:e2e` passes.
- [ ] `npm run lint`, `npm run typecheck`, and `npm run test` pass.
- [ ] The fix is committed and pushed to `origin/dev`.
- [ ] The new GitHub Actions run has all six jobs completed with `success`.

## Definition Of Done

- GitHub Actions is fully green for the new `dev` head.
- The remediation reason and security evidence are recorded in the task.
- Trellis task is archived and the session journal is recorded.
- `dump.rdb` remains the only unrelated local dirty path.

## Out Of Scope

- Merging `dev` into `main` or creating a release tag.
- Rotating production credentials or changing the deployed server.
- Suppressing a real unresolved critical vulnerability without explicit,
  time-bounded evidence.

## Technical Notes

- Workflow: `.github/workflows/ci.yml`
- Allowlist: `security/trivy-allowlist.json`
- Generator: `scripts/prepare-trivy-ignore.mjs`
- Browser config: `apps/web/playwright.config.ts`
- Failed run: `https://github.com/Grove-ovo/opensupport-agentops/actions/runs/29407900307`

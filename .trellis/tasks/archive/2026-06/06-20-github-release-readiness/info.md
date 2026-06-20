# Technical Design: GitHub Release Readiness

## Implemented

- Replaced the stale Phase 1-only README with a Phase 1-5 overview, setup,
  report links, branch policy, security notes, and explicit production
  boundaries.
- Added the MIT license declared by `package.json`.
- Added GitHub Actions CI using Node 22, `npm ci`, type-check, diff validation,
  and the full deterministic test/report chain.
- Added a release validator for README links, license metadata, CI commands,
  and ignored local artifacts.
- Corrected the Phase 5 integration validator so an archived parent task is
  resolved through the same active/archive lookup as its children.
- Updated local runtime documentation to the complete migration chain through
  `0013_failure_cases.sql`.

## Verification

- `npm run test:release`
- `npm run typecheck`
- `npm run lint`
- `npm test`
- GitHub workflow YAML parse
- tracked-file and credential-pattern scans
- `python3 ./.trellis/scripts/task.py validate 06-20-github-release-readiness`

## Publication

- Release-ready changes were merged to `dev`.
- The fully verified `dev` history was promoted to `main`.
- GitHub SSH authenticated as `Grove-ovo` over `ssh.github.com:443` because
  the current network closes port 22.
- Private repository:
  `git@github.com:Grove-ovo/opensupport-agentops.git`
- Published branches: `main` and `dev`.

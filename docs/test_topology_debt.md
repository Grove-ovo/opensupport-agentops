# Test Topology Debt: Phase-Staged Validators

**Status:** Accepted debt — non-urgent (remediation deferred)
**Owner:** Platform / DX
**Logged:** 2026-07-18
**Tracked in:** `operations/known-risk-acceptance.md` (row D-4)

## Summary

The repository grew one `scripts/validate-phaseN.mjs` gate per development
phase. Today there are **43** such scripts, and the root `package.json` `test`
script is a single serial `&&` chain of **60+** sub-tasks that interleaves
Node's built-in `node --test` package suites with the phase validators.

This is scaffolding accreted by delivery phase, not a designed test topology. It
works and gates correctly, but it carries maintainability cost.

## Impact

- **Serial and slow.** The whole `test` chain runs sequentially in one CI step;
  a failure late in the chain pays for everything before it.
- **Poor locality.** A newcomer cannot tell from the chain which suite covers
  which behavior; the phase numbers are historical, not semantic.
- **Hard failure triage.** When one phase fails, you read a very long command to
  find the offending sub-task.

This is **debt, not a defect**: no gate is missing or weakened, and correctness
is unaffected.

## Why deferred

Merging 43 phase validators into per-package suites is a wide, high-churn change
that touches every gate on the critical path. Doing it on a security/quality
hardening branch would mix risky refactors with the fixes under review. The
value is developer experience, not user-facing risk, so it does not justify
blocking the current release.

## Remediation plan (next iteration)

1. **Classify** each `validate-phaseN.mjs`: (a) a thin wrapper around a package
   `node --test` suite, or (b) a genuine cross-package integration/report check.
2. **Fold category (a)** into the owning package's `test:<pkg>` script and delete
   the redundant phase wrapper.
3. **Rename category (b)** by capability (e.g. `test:release-gate`,
   `test:eval-reports`) instead of phase number, and keep them as explicit gates.
4. **Parallelize** the independent package suites — either via a single
   `node --test <globs>` invocation or a CI matrix — and keep integration gates
   as their own serial job.
5. **Preserve every existing gate.** Remediation is a refactor of *how* tests are
   invoked, never a reduction of *what* is checked. Verify by diffing the set of
   assertions before/after.

## Acceptance criteria for closing this debt

- `package.json` `test` no longer references phase numbers.
- Independent unit suites run in parallel; wall-clock CI test time drops.
- The set of enforced gates is provably unchanged (no coverage/gate loss).

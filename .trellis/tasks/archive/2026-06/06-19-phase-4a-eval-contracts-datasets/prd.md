# PRD: Phase 4A - Eval Contracts + Datasets

## Goal

Create the shared, versioned, tenant-safe evaluation contracts and committed
datasets required by every later Phase 4 task.

## Requirements

- Add project-owned replay/security case, run, result, metric, candidate, gate,
  and failure reference types.
- Generate at least 150 replay and 40 security JSONL cases.
- Use explicit dataset version and dev/test/regression splits.
- Validate IDs, uniqueness, expected intent/action/risk/evidence/tool fields,
  P0 flags, forbidden outcomes, and masked input.
- Add PostgreSQL tables for eval/security cases, eval runs, and case results.
- Keep records immutable and tenant/candidate/version scoped.

## Acceptance Criteria

- [x] Replay dataset has exactly 150 valid unique cases.
- [x] Security dataset has exactly 40 valid unique cases.
- [x] Invalid or duplicate JSONL data is rejected.
- [x] Dataset content contains no plaintext credentials or direct PII fixtures.
- [x] Migration runs twice and live verification passes.
- [x] Lint, typecheck, package tests, static validation, and Trellis Check pass.

## Out of Scope

- Running cases, release candidates, release gates, reports, and failure cases.

# Phase 1D: LLM Call Logging + Cost Governance Seed

## Goal

Seed LLM observability and cost governance data required by original PRD Phase 1.

## Requirements

- Define LLM call log fields.
- Capture latency, token usage, estimated cost, prompt version, model name, and
  error code.
- Include tenant and trace linkage.
- Include immutable model config version linkage for reproducibility.
- Record call status and cost currency so failed/timeout calls and historical
  multi-currency data remain distinguishable.
- Snapshot the input/output per-million-token rates used for each estimate;
  model config versions do not own provider pricing.
- Seed budget reason codes for later runtime downgrade behavior.
- Estimate cost from input/output token usage and per-million-token rates using
  six-decimal storage precision.
- Evaluate projected per-ticket and daily costs without executing a runtime
  mode change.
- Enforce that trace and model config version links belong to the same tenant
  as the log row.
- Keep LLM call logs append-only.
- Provide tenant/ticket/day cost aggregation views grouped by currency.

## Data Shape

`LLMCallLog`:

- `id`
- `tenant_id`
- `ticket_id`
- `conversation_id`
- `trace_id`
- `model_config_version_id`
- `prompt_version_id`
- `model_provider`
- `model_name`
- `call_status`
- `input_tokens`
- `output_tokens`
- `total_tokens`
- `input_cost_per_million`
- `output_cost_per_million`
- `estimated_cost`
- `cost_currency`
- `latency_ms`
- `error_code`
- `budget_reason_code`
- `created_at`

## Acceptance Criteria

- Future LLM calls can be traced to tenant, ticket, trace, prompt version, and
  immutable model configuration.
- Cross-tenant trace or model config version references are rejected by the
  database.
- Successful, failed, timed-out, and cancelled calls have explicit status and
  consistent error-code validation.
- Cost estimation uses integer micro-currency units internally and produces a
  non-negative six-decimal result.
- Each log snapshots the input/output rates used, so token counts, rates, and
  the stored estimate can be independently reconciled.
- Budget evaluation distinguishes `within_budget`,
  `ticket_budget_exceeded`, `daily_budget_exceeded`, and
  `ticket_and_daily_budget_exceeded`.
- Budget evaluation rejects currency mismatches and only compares accumulated
  costs expressed in the configured budget currency.
- Zero budgets are treated as disabled limits, matching the Phase 1 schema
  defaults.
- Database logs are append-only and reject update/delete operations.
- Cost fields support per-ticket and daily reporting without aggregating
  different currencies together.
- Unit tests, lint, type-check, Phase 1 regressions, Phase 1D static validation,
  live PostgreSQL verification, and Trellis validation pass.

## Technical Approach

- Add `LLMCallLog` to `@opensupport/shared`.
- Add `@opensupport/llm-observability` with:
  - `estimateLLMCallCost`
  - `evaluateCostBudget`
  - `createLLMCallLog`
- Keep calculations in integer micro-units to match PostgreSQL
  `numeric(12, 6)` and avoid floating-point threshold drift.
- Add `0003_llm_call_logging_cost_governance.sql` to extend `llm_call_logs` with
  tenant-consistent trace/model config linkage, call status, cost currency,
  pricing-rate snapshots, generated total tokens, constrained budget reason
  codes, append-only triggers, and reporting views.
- The package emits validated persistence records. A future repository/provider
  adapter owns actual inserts and transaction boundaries.

## Decision (ADR-lite)

**Context**: Phase 1D must seed cost governance before the runtime mode state
machine exists.

**Decision**: Budget evaluation returns a reason code and projected totals only.
It does not choose Shadow/Assist/Auto or block a model call.

**Consequences**: The later runtime task can map stable reason codes to policy
actions without changing historical log semantics.

## Definition of Done

- Shared log type, observability package, tests, migration, live database
  verification, docs, and Trellis spec are implemented.
- No prompt content, completion content, API keys, or raw provider payloads are
  stored in the structured log contract.
- Existing Phase 1A-1C checks remain green.

## Out of Scope

- Calling any LLM provider.
- Full runtime degradation behavior.
- Eval and release gate metrics.
- Provider pricing discovery or external billing reconciliation.
- Prompt/completion content storage.
- Dashboard implementation.

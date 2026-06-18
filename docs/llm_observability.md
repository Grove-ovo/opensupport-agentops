# LLM Observability And Cost Governance

Status: Phase 1D foundation
Migration: `infra/migrations/0003_llm_call_logging_cost_governance.sql`

## Scope

Phase 1D defines immutable LLM call records and projected budget decisions. It
does not invoke a provider, persist prompt or completion content, select a
runtime mode, or block a call.

`@opensupport/llm-observability` exposes:

- `estimateLLMCallCost`
- `evaluateCostBudget`
- `createLLMCallLog`

The package validates and creates persistence records. A later repository
adapter owns database inserts and transactions.

## Cost Calculation

Prices are expressed in a three-letter `cost_currency` and stored with six
decimal places:

```text
input_cost_per_million
output_cost_per_million
estimated_cost
```

The implementation converts rates to integer micro-currency units, calculates
input and output costs with `BigInt`, rounds each component to the nearest
micro-unit, and rejects values outside PostgreSQL `numeric(12, 6)`.

Each log snapshots both rates. Historical cost can therefore be reconciled
from token counts and the rates actually used without depending on mutable
provider pricing.

## Budget Decisions

Budget evaluation receives current ticket cost, current UTC-day cost, the
estimated call cost, and the immutable model config budget:

```text
max_cost_per_ticket
daily_budget
budget_currency
```

Costs are compared only when `cost_currency` equals `budget_currency`. A zero
ticket or daily budget disables that limit. The result is one of:

- `within_budget`
- `ticket_budget_exceeded`
- `daily_budget_exceeded`
- `ticket_and_daily_budget_exceeded`

These reason codes are projected governance signals. Runtime mode transitions
remain deferred. Accumulated ticket/day values may exceed the per-row
`numeric(12, 6)` limit; the TypeScript evaluator accepts them up to the largest
micro-unit integer that JavaScript can represent exactly.

## Database Guarantees

`llm_call_logs` enforces:

- tenant-consistent `trace_id` and `model_config_version_id` references;
- required trace, prompt version, model config version, and latency fields;
- canonical provider, model, prompt version, and currency values;
- explicit call status and error-code consistency;
- generated `total_tokens`;
- agreement between the stored estimate and token/rate snapshots;
- non-negative pricing and estimated cost;
- canonical three-letter currency;
- constrained budget reason codes;
- append-only rows through update/delete rejection.

Status, rate, currency, and budget reason columns have no insert defaults.
Callers must provide the actual snapshot rather than implicitly recording a
successful zero-cost call.

The UTC daily views `llm_cost_daily_by_tenant` and
`llm_cost_daily_by_ticket` group by `cost_currency`. They never combine values
from different currencies.

## Data Exclusions

Structured LLM logs must not contain:

- prompt or completion content;
- API keys or encrypted secret references;
- raw provider request or response payloads.

## Verification

```bash
npm run test:phase1d
npm run test:llm-observability
npm run db:migrate
npm run db:verify:llm-observability
```

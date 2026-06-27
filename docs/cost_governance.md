# Cost Governance

Status: Phase 1D + AC-08
Packages: `@opensupport/llm-observability`, `apps/api`

## Overview

Cost governance ensures that AI agent operations stay within configured
budgets at both the per-ticket and daily levels. When projected costs exceed
configured caps, the system automatically degrades runtime behavior and
records the overrun in trace metadata for audit and analysis.

## Budget Configuration

Each tenant configures cost limits via `tenant_model_configs`:

| Field | Description | Unit |
|---|---|---|
| `max_cost_per_ticket` | Maximum cost for a single ticket lifecycle | USD (6 decimal) |
| `daily_budget` | Maximum aggregate cost per calendar day | USD (6 decimal) |
| `budget_currency` | Currency for budget evaluation | ISO 4217 |

A value of `0` disables that limit (no cap enforced).

## Cost Estimation

Before each LLM call, the runtime estimates the maximum call cost using:

```
estimated_cost = (inputTokens × inputCostPerMillion / 1,000,000)
               + (outputTokens × outputCostPerMillion / 1,000,000)
```

Rates are snapshotted from `AGENTOPS_MODEL_PRICING_JSON` at call time and
persisted with the log entry for historical reproducibility.

## Budget Evaluation

The `evaluateCostBudget` function compares projected costs against configured
limits:

```
projected_ticket_cost = current_ticket_cost + estimated_call_cost
projected_daily_cost = current_daily_cost + estimated_call_cost

ticket_exceeded = max_cost_per_ticket > 0 AND projected_ticket > max_cost_per_ticket
daily_exceeded  = daily_budget > 0 AND projected_daily > daily_budget
```

Returns one of:
- `within_budget` — proceed normally
- `ticket_budget_exceeded` — per-ticket limit breached
- `daily_budget_exceeded` — daily limit breached
- `ticket_and_daily_budget_exceeded` — both limits breached

## Degradation Behavior (AC-08)

When the budget is exceeded:

1. The LLM runtime returns `budget_blocked` without invoking the provider
2. A `llm_call_logs` row is persisted with `call_status = 'cancelled'` and
   the matching `budget_reason_code`
3. The ticket service checks for exceeded budget codes in the trace's
   `llm_call_logs` and merges `cost_cap_exceeded = true` into
   `agent_traces.metadata`
4. The runtime mode degrades from Auto to Assist or Shadow

The trace metadata field `cost_cap_exceeded` is the authoritative signal for
downstream consumers (dashboards, audit, eval). It is never mutated after
being set.

## LLM Call Log Schema

Each LLM call persists:

| Field | Description |
|---|---|
| `tenant_id` | Owning tenant |
| `trace_id` | Linking trace |
| `model_name` | Model used |
| `call_status` | `succeeded` / `failed` / `timed_out` / `cancelled` |
| `input_tokens` / `output_tokens` | Actual token counts |
| `input_cost_per_million` / `output_cost_per_million` | Snapshotted rates |
| `estimated_cost` | Computed cost in currency units |
| `cost_currency` | ISO 4217 currency code |
| `budget_reason_code` | `within_budget` / `ticket_budget_exceeded` / etc. |
| `latency_ms` | Call latency |
| `error_code` | Provider error if applicable |

## Reports

`reports/cost_report.md` contains per-tenant cost breakdowns, daily
aggregates, budget utilization rates, and cost-per-ticket distributions.

## Verification

```bash
npm run test:llm-observability
npm run test:e2e
npm run typecheck
npm run lint
```

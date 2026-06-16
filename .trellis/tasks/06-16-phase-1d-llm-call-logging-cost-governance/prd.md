# Phase 1D: LLM Call Logging + Cost Governance Seed

## Goal

Seed LLM observability and cost governance data required by original PRD Phase 1.

## Requirements

- Define LLM call log fields.
- Capture latency, token usage, estimated cost, prompt version, model name, and
  error code.
- Include tenant and trace linkage.
- Seed budget reason codes for later runtime downgrade behavior.

## Data Shape

`LLMCallLog`:

- `tenant_id`
- `ticket_id`
- `trace_id`
- `prompt_version_id`
- `model_provider`
- `model_name`
- `input_tokens`
- `output_tokens`
- `estimated_cost`
- `latency_ms`
- `error_code`
- `created_at`

## Acceptance Criteria

- Future LLM calls can be traced to tenant, ticket, trace, prompt version, and
  model.
- Cost fields can support per-ticket and daily budget reporting later.

## Out of Scope

- Calling any LLM provider.
- Full runtime degradation behavior.
- Eval and release gate metrics.

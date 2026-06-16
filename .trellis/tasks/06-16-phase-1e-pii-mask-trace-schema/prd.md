# Phase 1E: PII Mask + Trace Schema

## Goal

Define PII masking behavior and the trace schema seed required by original PRD
Phase 1.

## Requirements

- Mask phone, email, address, ID number, and bank card before future LLM calls.
- Preserve order ID where needed for business tools.
- Define `PIIMaskResult` semantics.
- Define `AgentTrace` seed fields for later Agent pipeline and runtime modes.
- Include version snapshot placeholders.

## Data Shapes

`PIIMaskResult`:

- `masked_text`
- `detected_categories`
- `replacement_map_ref`

`AgentTrace`:

- `trace_id`
- `tenant_id`
- `ticket_id`
- `conversation_id`
- `runtime_mode`
- `agent_version_id`
- `prompt_version_id`
- `model_provider`
- `model_name`
- `intent`
- `entities`
- `route`
- `retrieved_doc_ids`
- `tool_call_ids`
- `risk_level`
- `risk_decision`
- `final_action`
- `latency_ms`
- `input_tokens`
- `output_tokens`
- `estimated_cost`
- `failure_bucket`
- `created_at`

## Acceptance Criteria

- Future LLM input can be masked before provider calls.
- Trace seed can accept later RAG, tool, risk, runtime mode, and eval fields.
- PII masking scope matches original PRD Phase 1 security baseline.

## Out of Scope

- Full prompt injection defense.
- Security Eval.
- Agent pipeline.

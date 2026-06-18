# Phase 1E: PII Mask + Trace Schema

## Goal

Implement the Phase 1 security boundary that masks supported PII before future
LLM calls and creates reproducible, tenant-scoped trace seeds for later Agent,
RAG, tool, runtime mode, approval, eval, and release tasks.

## Requirements

### PII Masking

- Mask email, phone, address, government ID number, and bank card values before
  any future provider call.
- Use deterministic local detection only; do not call an LLM or external PII
  service.
- Support high-confidence MVP patterns:
  - standard email addresses;
  - Chinese mobile and common international/US phone formats;
  - Chinese citizen IDs and US SSNs;
  - Luhn-valid 13-19 digit bank card candidates;
  - labelled addresses plus common Chinese and English street-address forms.
- Preserve explicit order IDs:
  - values provided through `preserveValues`;
  - values following `order id`, `order number`, `订单号`, or `订单编号` labels.
- Replace values with stable category placeholders such as `[EMAIL_1]` and
  `[BANK_CARD_1]`.
- Repeated identical values in one input reuse the same placeholder.
- Return a safe `PIIMaskResult` that contains masked text, first-occurrence
  category order, and an opaque replacement-map reference.
- Return the sensitive replacement map separately as ephemeral operation data.
  It must not be logged or embedded in `PIIMaskResult`.
- When no PII is detected, return the original text, an empty category list,
  a null replacement-map reference, and an empty replacement map.

### Trace Schema

- Define `TraceVersionSnapshot` with:
  - `agent_version_id`
  - `prompt_version_id`
  - `policy_version_id`
  - `tool_manifest_version_id`
  - `risk_rule_version_id`
  - `retrieval_config_version_id`
  - `model_config_version_id`
- Define `AgentTrace` using the original PRD fields plus:
  - `execution_state`
  - `pii_categories`
  - `pii_replacement_map_ref`
  - `masked_input_hash`
  - `updated_at`
- Require explicit tenant, ticket/conversation/message context, runtime mode,
  complete version snapshot, and PII mask result when creating a trace.
- Store only a SHA-256 hash of masked input in the trace, not raw customer text
  or the sensitive replacement map.
- Enforce tenant-consistent model config references.
- Keep trace identity, runtime mode, version snapshot, PII metadata, input hash,
  and creation timestamp immutable after insertion.
- Seed the controlled-launch `TicketExecution` states without implementing
  transition behavior:
  `received`, `normalized`, `planned`, `waiting_tool`, `waiting_approval`,
  `replied`, `private_noted`, `handed_off`, `failed`.
- Keep operational trace fields mutable for later pipeline tasks.

## Data Shapes

`PIIMaskResult`:

```text
masked_text
detected_categories
replacement_map_ref
```

`PIIReplacement`:

```text
placeholder
category
original_value
```

`PIIMaskOperation`:

```text
result
replacements
```

`TraceVersionSnapshot`:

```text
agent_version_id
prompt_version_id
policy_version_id
tool_manifest_version_id
risk_rule_version_id
retrieval_config_version_id
model_config_version_id
```

`AgentTrace`:

```text
trace_id
tenant_id
ticket_id
conversation_id
message_id
runtime_mode
execution_state
agent_version_id
prompt_version_id
policy_version_id
tool_manifest_version_id
risk_rule_version_id
retrieval_config_version_id
model_config_version_id
model_provider
model_name
intent
entities
route
retrieved_doc_ids
tool_call_ids
risk_level
risk_decision
final_action
latency_ms
input_tokens
output_tokens
estimated_cost
failure_bucket
pii_categories
pii_replacement_map_ref
masked_input_hash
metadata
created_at
updated_at
```

## Acceptance Criteria

- Email, supported phone, address, ID, and Luhn-valid bank card examples are
  replaced before masked text is exposed to a future provider.
- Explicit and labelled order IDs remain unchanged, including card-length order
  IDs.
- Overlapping detector matches never corrupt text or reveal a partial PII
  value.
- Placeholder assignment is deterministic for the same input and options.
- `PIIMaskResult` never contains original PII values.
- Trace creation rejects invalid UUIDs, blank required IDs, incomplete version
  snapshots, invalid runtime/execution enum values, and malformed PII results.
- Trace creation hashes masked input and does not expose raw input or
  replacements in the persistence record.
- PostgreSQL rejects cross-tenant model config links and mutation of immutable
  trace snapshot fields.
- PostgreSQL validates trace JSON shapes, PII categories, hash/reference
  formats, runtime modes, and execution states.
- Unit tests, Phase 1A-1D regressions, Phase 1E static validation, live
  PostgreSQL verification, lint, type-check, and Trellis validation pass.

## Technical Approach

- Add shared contracts under `@opensupport/shared`.
- Add `@opensupport/pii` with:
  - `maskPII`
  - deterministic protected-range and overlap handling;
  - Luhn and Chinese citizen-ID validation;
  - ephemeral replacement-map output.
- Add `@opensupport/trace` with:
  - `createAgentTrace`
  - shared validation errors;
  - SHA-256 masked-input hashing.
- Add `0004_pii_mask_trace_schema.sql` to harden `agent_traces`, convert
  `model_config_version_id` to UUID, add PII/execution fields, enforce the
  tenant model-config foreign key, and protect immutable trace snapshots.
- Existing legacy trace rows with incomplete snapshots must be backfilled
  before migration; the migration fails rather than inventing fake versions.
- No replacement-map database table is added in Phase 1. A future encrypted
  persistence adapter may store the ephemeral map under
  `replacement_map_ref`.

## Decision (ADR-lite)

**Context**: Phase 1 must prevent obvious PII leakage before provider calls
without adding an external security service or weakening order-tool workflows.

**Decision**: Use conservative deterministic detection with checksum validation
and explicit order-ID protection. Return sensitive replacements separately from
the safe result. Freeze trace version and PII audit snapshots in PostgreSQL.

**Consequences**: Behavior is fast, testable, and offline, with lower false
positive risk. Unlabelled or unusual addresses and locale-specific identifiers
may require later detector plugins or Security Eval improvements.

## Definition of Done

- PII and trace packages, shared contracts, unit tests, migration, live
  database verification, docs, Phase 1E static validation, and Trellis spec are
  implemented.
- `docs/trace_schema.md` documents the final Phase 1 trace contract.
- Existing Phase 1A-1D checks remain green.
- No raw message, original PII, replacement map, prompt content, completion
  content, API key, or provider payload is persisted by the new contracts.

## Out of Scope

- Prompt injection defense.
- Output PII leak scanning and Security Eval.
- External PII/NER services.
- Encrypted replacement-map persistence or unmasking replies.
- Agent pipeline execution.
- Runtime mode or `TicketExecution` transition guards.
- RAG, tool calls, approval, eval, release gate, and dashboard behavior.

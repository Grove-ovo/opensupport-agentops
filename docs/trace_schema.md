# PII Masking And Trace Schema

Status: Phase 1E foundation
Migration: `infra/migrations/0004_pii_mask_trace_schema.sql`

## Provider-Bound Data Flow

Phase 1E establishes this boundary:

```text
canonical customer text
  -> maskPII
  -> PIIMaskResult.masked_text
  -> future provider call

PIIMaskResult
  -> createAgentTrace
  -> masked_input_hash + PII categories + replacement map reference
  -> agent_traces
```

Raw customer text and the sensitive replacement map are not part of the trace
record.

## PII Masking

`@opensupport/pii` detects:

- email;
- Chinese mobile and common international/US phone forms;
- labelled and common Chinese/English addresses;
- Chinese citizen IDs and US SSNs;
- Luhn-valid bank card candidates.

Values become indexed placeholders:

```text
jane@example.com -> [EMAIL_1]
4111 1111 1111 1111 -> [BANK_CARD_1]
```

Repeated identical values reuse their placeholder. Detection is local and
deterministic except for the generated opaque replacement map reference.

### Order ID Preservation

Business tools need order IDs. `maskPII` protects:

- values passed through `preserveValues`;
- values following `order id`, `order number`, `订单号`, or `订单编号`.

Checksum validation reduces the chance that arbitrary numeric order IDs are
treated as bank cards or citizen IDs.

### Replacement Map Boundary

`maskPII` returns:

```text
PIIMaskOperation
  result
    masked_text
    detected_categories
    replacement_map_ref
  replacements
    placeholder
    category
    original_value
```

Only `result` is safe for ordinary pipeline and trace use. `replacements` is
ephemeral sensitive data and must not be logged, added to trace metadata, or
sent to the provider. Phase 1 does not persist or resolve the replacement map.
A future encrypted adapter may store it under `replacement_map_ref`.

## Trace Creation

`@opensupport/trace` exposes `createAgentTrace`. It requires:

- tenant, ticket, conversation, and message identifiers;
- explicit Shadow/Assist/Auto runtime mode;
- a complete immutable `TraceVersionSnapshot`;
- a safe `PIIMaskResult`.

The factory stores `masked_input_hash`, the SHA-256 hash of `masked_text`.
Neither masked text nor raw customer input is written into `AgentTrace`.

## Immutable Version Snapshot

Every trace freezes:

```text
agent_version_id
prompt_version_id
policy_version_id
tool_manifest_version_id
risk_rule_version_id
retrieval_config_version_id
model_config_version_id
```

`model_config_version_id` is a UUID with a tenant-consistent foreign key to the
immutable model config row.

PostgreSQL rejects updates to trace identity, runtime mode, version snapshot,
PII categories, replacement map reference, masked-input hash, and creation
timestamp. Operational fields such as intent, route, risk decision, latency,
tokens, cost, final action, and failure bucket remain mutable.
`execution_state` changes must use `transition_ticket_execution(...)`, which
performs expected-state validation and writes an append-only transition audit.

## TicketExecution Seed

The schema accepts:

```text
received
normalized
planned
waiting_tool
waiting_approval
replied
private_noted
handed_off
failed
```

Phase 1E defines the storage enum. Phase 3A implements its transition guard and
audit boundary; runtime mode decisions and delivery remain later Phase 3 work.

## JSON And Security Constraints

- `entities` and `metadata` must be JSON objects.
- `retrieved_doc_ids` and `tool_call_ids` must be JSON arrays.
- PII categories must be allowed and unique.
- A non-empty PII category list requires a valid `pii-map:` reference.
- `masked_input_hash` must be lowercase SHA-256 hexadecimal.
- Existing legacy traces must be backfilled before applying migration `0004`;
  the migration does not invent version IDs or PII audit data.

Trace metadata must contain only non-sensitive structured values. It must not
contain raw messages, original PII, replacement maps, prompt/completion
content, API keys, encrypted key references, or raw provider payloads.

## Verification

```bash
npm run test:phase1e
npm run test:pii
npm run test:trace
npm run db:migrate
npm run db:verify:trace
```

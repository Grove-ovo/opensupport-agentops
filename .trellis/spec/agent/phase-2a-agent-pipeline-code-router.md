# Phase 2A Agent Pipeline And Code Router

## Scenario: Deterministic Entry To The Agent Pipeline

### 1. Scope / Trigger

- Trigger: changes to Agent intents, pipeline context, route decisions, order
  ID extraction, sensitive routing signals, or Code Router behavior.
- Applies to `packages/shared/src/agent.ts`, `packages/agent-core`,
  `docs/agent_pipeline.md`, and `scripts/validate-phase2a.mjs`.
- Does not authorize provider calls, RAG, tools, risk decisions, persistence,
  runtime-mode transitions, approvals, or Chatwoot sending.

### 2. Signatures

```ts
createAgentPipelineContext(
  input: CreateAgentPipelineContextInput,
  options?: CreateAgentPipelineContextOptions,
): AgentPipelineContext

routeAgentMessage(context: AgentPipelineContext): RouteDecision
```

```text
npm run test:phase2a
npm run test:agent-core
```

### 3. Contracts

`AgentPipelineContext`:

```text
trace_id
tenant_id
ticket_id
conversation_id
message_id
masked_text
runtime_mode
version_snapshot
deadline_at
```

- `masked_text` is transient provider-bound text. It may be read by pipeline
  steps but must not be copied into route results or trace metadata.
- Tenant and trace IDs are UUIDs; ticket, conversation, message, and all
  non-model snapshot IDs are non-empty canonical text.
- `model_config_version_id` is a UUID.
- `deadline_at` is an absolute future ISO timestamp.

`RouteDecision`:

```text
intent
candidate_intents
confidence
route
entities.order_ids
required_capabilities
sensitive_signals
triage_required
reason_codes
```

- Supported intents are the eight source-PRD values.
- Rules are evaluated in fixed source order. When multiple business rules
  match, that order controls `candidate_intents`; it does not silently choose
  a winner. The decision becomes `unknown` and requires triage.
- Order-dependent intents require a labelled Chinese or English order ID.
- Sensitive-signal detection is independent from business intent detection.
- Outputs must be deterministic, serializable, and free of complete customer
  text, raw PII, replacement maps, credentials, and provider payloads.

### 4. Validation & Error Matrix

| Condition | Expected behavior |
|-----------|-------------------|
| Blank required identity or masked text | `AgentCoreValidationError` with `required` |
| Invalid trace/tenant/model config UUID | validation error with `invalid_uuid` |
| Unsupported runtime mode | validation error with `invalid_enum` |
| Invalid deadline | validation error with `invalid_timestamp` |
| Deadline at or before current time | validation error with `deadline_expired` |
| No supported intent | `unknown`, `triage_required=true` |
| Multiple intent rules match | ordered candidates, `unknown`, conflict reason |
| Order-dependent intent lacks order ID | preserve candidate intent but route to triage |
| Sensitive phrase plus valid business intent | preserve both intent and sensitive signals |

> **Warning**: Do not put a word boundary after an optional punctuation
> character. For example, `no\.?\b` fails for `Order no. AB-1` because there is
> no word boundary between `.` and the following space. Use a lookahead for
> whitespace or separators after `no\.?`.

### 5. Good/Base/Bad Cases

- Good: route `订单号 CN-1，订单状态怎么样` to `order_status` and preserve
  only the normalized order ID.
- Good: return ordered candidates and require triage when logistics and refund
  request signals appear together.
- Base: route a clear return-policy question without requiring an order ID.
- Bad: return `masked_text` inside `RouteDecision`.
- Bad: use a model, database, or network call inside the Code Router.
- Bad: let a matched business intent suppress approval-bypass or
  cross-account-access signals.

### 6. Tests Required

- Unit tests cover all supported business intents in Chinese/English examples.
- Tests cover unknown, conflict, and missing-order-ID triage.
- Tests cover multiple labelled order IDs and `Order no.` punctuation.
- Tests cover all sensitive signals independently from intent.
- Tests prove repeated input produces deeply equal output and route results do
  not contain the input text.
- Tests aggregate validation failures and cover expired deadlines.
- Static validation asserts contracts, exports, docs, root scripts, build
  references, and the no-network/no-provider router boundary.
- Run full regression tests because shared types and root build references
  affect every package.

### 7. Wrong vs Correct

#### Wrong

```ts
return {
  intent: 'order_status',
  customerMessage: context.masked_text,
};
```

This copies transient customer text into a reusable decision object and makes
later trace persistence likely to leak message content.

#### Correct

```ts
return {
  intent: 'order_status',
  entities: { order_ids: ['CN-1'] },
  reason_codes: ['matched_order_status', 'order_id_extracted'],
};
```

The result contains only normalized routing metadata required by downstream
steps.

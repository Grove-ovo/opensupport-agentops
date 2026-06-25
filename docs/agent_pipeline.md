# Agent Pipeline And Code Router

Status: Phase 2A
Package: `@opensupport/agent-core`

## Boundary

Phase 2A establishes a deterministic entry point:

```text
PII-masked customer text + trace identity/version snapshot
  -> createAgentPipelineContext
  -> routeAgentMessage
  -> RouteDecision
```

The package performs no model, network, database, RAG, tool, approval, or
Chatwoot side effect.

## Pipeline Context

`AgentPipelineContext` contains tenant, trace, ticket, conversation, message,
runtime mode, immutable version snapshot, provider-bound masked text, and an
absolute deadline.

`masked_text` is transient. It must not be persisted in trace metadata or
copied into `RouteDecision`. Raw customer text, PII replacement maps, provider
payloads, and credentials are forbidden.

## Supported Intents

```text
order_status
logistics_query
refund_eligibility
refund_request
return_policy
invoice_request
complaint_escalation
unknown
```

## Routing Precedence

1. complaint or explicit handoff
2. explicit refund request
3. refund eligibility
4. logistics
5. order status
6. invoice
7. return policy
8. unknown

When more than one intent rule matches, the router returns `unknown` with the
ordered `candidate_intents` and requires conditional triage. An intent that
needs an order ID also requires triage when no labelled Chinese or English
order ID is present.

## Downstream Capabilities

Clear decisions identify only the required later components:

| Intent | Capabilities |
|--------|--------------|
| order status | order tool, risk guardrail, response agent |
| logistics | logistics tool, risk guardrail, response agent |
| refund eligibility/request | RAG, refund tool, risk guardrail, response agent |
| return policy | RAG, risk guardrail, response agent |
| invoice | order tool, risk guardrail, response agent |
| complaint | handoff, risk guardrail |
| unknown/ambiguous | triage agent, risk guardrail |

These are planning signals. Phase 2A does not invoke the components.

## Sensitive Signals

Sensitive detection runs independently from intent routing:

- approval bypass
- direct refund execution
- credential disclosure
- system-prompt disclosure
- cross-account order access

The router only reports these signals. Phase 2F owns blocking gate decisions.

## Multi-Turn Conversation Memory

The current pipeline is **stateless per message**. Each inbound customer
message creates a new `AgentPipelineContext` and a new trace; the pipeline
does not load prior turns or conversation history. `conversation_id` links
traces across the same conversation in the `agent_traces` table, but the
agent pipeline receives only the current message's `masked_text`.

Multi-turn evaluation cases (`eval/multiturn_eval_cases.jsonl`) quantify
this limitation via the `context_loss_rate` metric: follow-up turns that
reference prior context without repeating details (e.g. "what about the
other one?") may mismatch expected intent or action because the pipeline
cannot see the prior turn. A future phase may introduce a dedicated memory
adapter that loads recent conversation turns into the pipeline context.

## Validation

`createAgentPipelineContext` rejects blank identities/text, invalid UUIDs,
unsupported runtime modes, incomplete version snapshots, invalid timestamps,
and expired deadlines with `AgentCoreValidationError`.

## Verification

```bash
npm run test:phase2a
npm run test:agent-core
npm run typecheck
npm run lint
```

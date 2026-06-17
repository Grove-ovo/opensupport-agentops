# Phase 1B: Chatwoot Connector

## Goal

Define and implement the Chatwoot connector foundation for original PRD Phase 1.

## Requirements

- Support Agent Bot endpoint contract.
- Support account webhook endpoint contract.
- Verify webhook signature when a secret is configured.
- Deduplicate deliveries by Chatwoot delivery ID when available.
- Use fallback dedupe key `tenant_id + conversation_id + message_id + event_type`.
- Ignore AgentOps self-created outgoing messages.
- Produce canonical inbound events for later pipeline work.

## Data Shape

`CanonicalInboundEvent`:

- `tenant_id`
- `source`
- `conversation_id`
- `message_id`
- `event_type`
- `dedupe_key`
- `payload_hash`
- `is_customer_message`
- `is_self_outgoing`

## Acceptance Criteria

- Same Chatwoot message through Agent Bot and webhook can only seed one
  canonical inbound event.
- Outgoing AgentOps messages do not trigger the future pipeline.
- Raw payload hash is preserved for audit.

## Out of Scope

- Agent response generation.
- RAG, tools, runtime modes, approval, eval, release gate.

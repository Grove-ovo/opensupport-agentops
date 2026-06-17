# Technical Design: Phase 1 - Chatwoot + Tenant + BYOK Foundation

Status: Proposed  
Date: 2026-06-16  
Source PRD: `OpenSupport_AgentOps_PRD.md`

## Phase Boundary

This task is the first executable foundation slice from the original PRD. It
does not implement the complete AgentOps platform. It prepares the storage,
integration, logging, masking, and trace contracts required by later phases.

The user registration example discussed earlier is not part of this task.

## Phase 1 Components

### Local Runtime + Database Foundation

Establish development runtime expectations for:

- AgentOps API
- PostgreSQL
- Redis
- local Chatwoot

Database environment decision:

- Development and local demo use local PostgreSQL with pgvector, ideally via
  Docker Compose in the Phase 1A task.
- Staging and production use managed cloud PostgreSQL with pgvector.
- The app must not maintain separate local/cloud database implementations; it
  should switch environments through `DATABASE_URL` and shared migrations.

Minimum Phase 1 tables:

- `tenants`
- `chatwoot_connections`
- `tenant_model_configs`
- `agent_traces`
- `llm_call_logs`
- `audit_logs`

### Chatwoot Connector

Define contracts for:

- Agent Bot endpoint
- account webhook endpoint
- webhook signature verification
- delivery dedupe
- event parsing
- self outgoing message ignore
- canonical inbound event generation

Canonical inbound event semantics:

```text
CanonicalInboundEvent
  tenant_id
  source                  # agent_bot | account_webhook
  conversation_id
  message_id
  event_type
  dedupe_key
  payload_hash
  is_customer_message
  is_self_outgoing
```

Only canonical incoming customer messages may seed later pipeline execution.

### Tenant Config + BYOK Model Config

Define tenant-scoped model config:

```text
TenantModelConfig
  tenant_id
  provider
  fast_model
  strong_model
  embedding_model
  fallback_model
  timeout_ms
  max_cost_per_ticket
  daily_budget
  encrypted_api_key_ref
```

MVP uses local envelope encryption for encrypted API key references. Production
secret manager integration remains future work.

### LLM Call Logging + Cost Governance Seed

Define logging fields for every future LLM call:

```text
LLMCallLog
  tenant_id
  ticket_id
  trace_id
  prompt_version_id
  model_provider
  model_name
  input_tokens
  output_tokens
  estimated_cost
  latency_ms
  error_code
  created_at
```

Phase 1 only seeds the cost governance fields and reason codes. Full runtime
downgrade behavior belongs to later runtime mode work.

### PII Mask + Trace Schema

PII masking categories:

- phone
- email
- address
- ID number
- bank card

Trace schema seed:

```text
AgentTrace
  trace_id
  tenant_id
  ticket_id
  conversation_id
  runtime_mode
  agent_version_id
  prompt_version_id
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
  created_at
```

Phase 1 should include version snapshot placeholders even before the full agent
pipeline exists.

## Child Task Execution Order

1. `06-16-phase-1a-local-runtime-database-foundation`
2. `06-16-phase-1b-chatwoot-connector`
3. `06-16-phase-1c-tenant-byok-model-config`
4. `06-16-phase-1d-llm-call-logging-cost-governance`
5. `06-16-phase-1e-pii-mask-trace-schema`

## Deferred From Current Task

- RAG ingestion/retrieval
- Agent pipeline
- MCP-compatible tools
- Runtime modes full execution
- Approval queue
- Replay Eval
- Security Eval
- Release Gate
- Dashboard screens
- Real ecommerce platform adapters
- User registration and full SaaS account management

## Validation Plan

- Trellis task validation passes.
- Parent task stays in `planning`.
- Phase 1A-1E children are linked to the parent.
- Current task PRD maps to original PRD Phase 1 deliverables.
- Current task PRD does not include user registration, RAG, tools, eval, release
  gate, or dashboard implementation.

## References

- Source PRD: `OpenSupport_AgentOps_PRD.md`
- Architecture: `docs/architecture.md`
- ADR-001: `docs/adr/ADR-001-opensupport-agentops-mvp-architecture.md`
- ADR-002: `docs/adr/ADR-002-controlled-launch-architecture.md`

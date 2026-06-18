# Phase 1 Database Schema

Status: Phase 1A foundation + Phase 1C model config versioning
Migrations:

- `infra/migrations/0001_phase1_foundation.sql`
- `infra/migrations/0002_tenant_model_config_versions.sql`

## Design Rules

- `tenants` is the ownership root for Phase 1 data.
- Tenant-scoped tables include `tenant_id` and a foreign key to `tenants`.
- Secret columns store references only, never plaintext secrets.
- Runtime-heavy fields that belong to later phases are represented as nullable
  placeholders or JSON metadata, not as separate feature tables.
- Audit logs are append-only and do not include an `updated_at` column.

## Tables

### tenants

Stores tenant identity and lifecycle state.

Key fields:

- `id`
- `slug`
- `display_name`
- `status`
- `metadata`
- `created_at`
- `updated_at`

### chatwoot_connections

Stores a tenant-scoped Chatwoot connection. This is configuration only; the
connector endpoints and canonical event persistence are Phase 1B.

Key fields:

- `tenant_id`
- `base_url`
- `account_id`
- `inbox_id`
- `agent_bot_id`
- `webhook_secret_ref`
- `api_token_ref`
- `verification_status`
- `is_active`

### tenant_model_configs

Stores tenant BYOK model configuration using encrypted key references.

Key fields:

- `id` as the future trace `model_config_version_id`
- `tenant_id`
- `version`
- `provider`
- `fast_model`
- `strong_model`
- `embedding_model`
- `fallback_model`
- `timeout_ms`
- `max_cost_per_ticket`
- `daily_budget`
- `budget_currency`
- `encrypted_api_key_ref`
- `is_active`
- `config_fingerprint`

Phase 1C treats each row as an immutable version. The schema permits multiple
versions per tenant, enforces one active version, and allows only `is_active`
and trigger-maintained `updated_at` to change after insertion.

### agent_traces

Seeds traceability for later agent pipeline work. The table includes version
snapshot placeholders required by the controlled launch architecture.

Key fields:

- `trace_id`
- `tenant_id`
- `ticket_id`
- `conversation_id`
- `message_id`
- `runtime_mode`
- `agent_version_id`
- `prompt_version_id`
- `policy_version_id`
- `tool_manifest_version_id`
- `risk_rule_version_id`
- `retrieval_config_version_id`
- `model_config_version_id`
- `latency_ms`
- `input_tokens`
- `output_tokens`
- `estimated_cost`
- `failure_bucket`

### llm_call_logs

Seeds LLM observability and cost governance. Real model invocation is not part
of Phase 1A.

Key fields:

- `tenant_id`
- `trace_id`
- `ticket_id`
- `conversation_id`
- `prompt_version_id`
- `model_provider`
- `model_name`
- `input_tokens`
- `output_tokens`
- `estimated_cost`
- `latency_ms`
- `error_code`
- `budget_reason_code`

### audit_logs

Records actor, action, decision, and input/output hashes for future connector
and runtime actions.

Key fields:

- `tenant_id`
- `actor_type`
- `actor_id`
- `action`
- `resource_type`
- `resource_id`
- `decision`
- `input_hash`
- `output_hash`
- `metadata`
- `created_at`

## Deferred Tables

The following original PRD tables are intentionally deferred:

- `runtime_mode_configs`
- `policy_documents`
- `prompt_versions`
- `tool_manifests`
- `risk_rules`
- `chatwoot_events`
- `tickets`
- `messages`
- `intent_predictions`
- `retrieval_events`
- `tool_calls`
- `approval_requests`
- `eval_cases`
- `security_eval_cases`
- `eval_runs`
- `eval_case_results`
- `release_candidates`
- `release_gate_results`
- `failure_cases`

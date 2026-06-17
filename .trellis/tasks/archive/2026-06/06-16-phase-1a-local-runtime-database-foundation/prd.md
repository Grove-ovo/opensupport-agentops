# Phase 1A: Local Runtime + Database Foundation

## Goal

Prepare the local runtime and minimum database foundation required by original
PRD Phase 1.

## Requirements

- Document local runtime expectations for AgentOps API, PostgreSQL, Redis, and
  local Chatwoot.
- Define migration foundation and minimum Phase 1 tables.
- Include `tenant_id` ownership patterns where records are tenant-scoped.
- Do not implement user registration, full account management, billing, or RBAC.

## Data Scope

- `tenants`
- `chatwoot_connections`
- `tenant_model_configs`
- `agent_traces`
- `llm_call_logs`
- `audit_logs`

## Acceptance Criteria

- Empty local database can be migrated in future implementation.
- Phase 1 tables are sufficient for Chatwoot connection config, model config,
  trace seed, LLM call logs, and audit logs.
- Non-Phase-1 tables are deferred.

## Out of Scope

- Public user registration.
- RAG, tools, agent pipeline, runtime modes, approval, eval, release gate.

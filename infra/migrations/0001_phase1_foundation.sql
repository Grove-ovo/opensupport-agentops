-- Phase 1A foundation schema for OpenSupport AgentOps.
-- Scope: tenant identity, Chatwoot connection config, BYOK model config,
-- trace seed, LLM call logs, and audit logs.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenants_slug_format_chk CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  CONSTRAINT tenants_status_chk CHECK (status IN ('active', 'suspended', 'archived'))
);

DROP TRIGGER IF EXISTS tenants_set_updated_at ON tenants;
CREATE TRIGGER tenants_set_updated_at
BEFORE UPDATE ON tenants
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS chatwoot_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  base_url text NOT NULL,
  account_id bigint NOT NULL,
  inbox_id bigint,
  agent_bot_id bigint,
  webhook_secret_ref text,
  api_token_ref text,
  verification_status text NOT NULL DEFAULT 'unverified',
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chatwoot_connections_base_url_chk CHECK (base_url ~ '^https?://'),
  CONSTRAINT chatwoot_connections_verification_status_chk CHECK (
    verification_status IN ('unverified', 'verified', 'failed')
  ),
  CONSTRAINT chatwoot_connections_tenant_account_uniq UNIQUE (tenant_id, base_url, account_id)
);

CREATE INDEX IF NOT EXISTS chatwoot_connections_tenant_idx
ON chatwoot_connections (tenant_id);

DROP TRIGGER IF EXISTS chatwoot_connections_set_updated_at ON chatwoot_connections;
CREATE TRIGGER chatwoot_connections_set_updated_at
BEFORE UPDATE ON chatwoot_connections
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS tenant_model_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  fast_model text NOT NULL,
  strong_model text NOT NULL,
  embedding_model text NOT NULL,
  fallback_model text NOT NULL,
  timeout_ms integer NOT NULL DEFAULT 30000,
  max_cost_per_ticket numeric(12, 6) NOT NULL DEFAULT 0,
  daily_budget numeric(12, 6) NOT NULL DEFAULT 0,
  budget_currency char(3) NOT NULL DEFAULT 'USD',
  encrypted_api_key_ref text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_model_configs_provider_chk CHECK (length(trim(provider)) > 0),
  CONSTRAINT tenant_model_configs_timeout_chk CHECK (timeout_ms > 0 AND timeout_ms <= 120000),
  CONSTRAINT tenant_model_configs_ticket_budget_chk CHECK (max_cost_per_ticket >= 0),
  CONSTRAINT tenant_model_configs_daily_budget_chk CHECK (daily_budget >= 0),
  CONSTRAINT tenant_model_configs_currency_chk CHECK (budget_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT tenant_model_configs_tenant_uniq UNIQUE (tenant_id)
);

CREATE INDEX IF NOT EXISTS tenant_model_configs_tenant_idx
ON tenant_model_configs (tenant_id);

DROP TRIGGER IF EXISTS tenant_model_configs_set_updated_at ON tenant_model_configs;
CREATE TRIGGER tenant_model_configs_set_updated_at
BEFORE UPDATE ON tenant_model_configs
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS agent_traces (
  trace_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id text,
  conversation_id text,
  message_id text,
  runtime_mode text NOT NULL DEFAULT 'shadow',
  agent_version_id text,
  prompt_version_id text,
  policy_version_id text,
  tool_manifest_version_id text,
  risk_rule_version_id text,
  retrieval_config_version_id text,
  model_config_version_id text,
  model_provider text,
  model_name text,
  intent text,
  entities jsonb NOT NULL DEFAULT '{}'::jsonb,
  route text,
  retrieved_doc_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  tool_call_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  risk_level text,
  risk_decision text,
  final_action text,
  latency_ms integer,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  estimated_cost numeric(12, 6) NOT NULL DEFAULT 0,
  failure_bucket text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_traces_runtime_mode_chk CHECK (runtime_mode IN ('shadow', 'assist', 'auto')),
  CONSTRAINT agent_traces_latency_chk CHECK (latency_ms IS NULL OR latency_ms >= 0),
  CONSTRAINT agent_traces_input_tokens_chk CHECK (input_tokens >= 0),
  CONSTRAINT agent_traces_output_tokens_chk CHECK (output_tokens >= 0),
  CONSTRAINT agent_traces_estimated_cost_chk CHECK (estimated_cost >= 0)
);

CREATE INDEX IF NOT EXISTS agent_traces_tenant_created_idx
ON agent_traces (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_traces_tenant_conversation_idx
ON agent_traces (tenant_id, conversation_id);

CREATE INDEX IF NOT EXISTS agent_traces_tenant_ticket_idx
ON agent_traces (tenant_id, ticket_id);

DROP TRIGGER IF EXISTS agent_traces_set_updated_at ON agent_traces;
CREATE TRIGGER agent_traces_set_updated_at
BEFORE UPDATE ON agent_traces
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS llm_call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  trace_id uuid REFERENCES agent_traces(trace_id) ON DELETE SET NULL,
  ticket_id text,
  conversation_id text,
  prompt_version_id text,
  model_provider text NOT NULL,
  model_name text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  estimated_cost numeric(12, 6) NOT NULL DEFAULT 0,
  latency_ms integer,
  error_code text,
  budget_reason_code text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT llm_call_logs_provider_chk CHECK (length(trim(model_provider)) > 0),
  CONSTRAINT llm_call_logs_model_chk CHECK (length(trim(model_name)) > 0),
  CONSTRAINT llm_call_logs_input_tokens_chk CHECK (input_tokens >= 0),
  CONSTRAINT llm_call_logs_output_tokens_chk CHECK (output_tokens >= 0),
  CONSTRAINT llm_call_logs_estimated_cost_chk CHECK (estimated_cost >= 0),
  CONSTRAINT llm_call_logs_latency_chk CHECK (latency_ms IS NULL OR latency_ms >= 0)
);

CREATE INDEX IF NOT EXISTS llm_call_logs_tenant_created_idx
ON llm_call_logs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS llm_call_logs_trace_idx
ON llm_call_logs (trace_id);

CREATE INDEX IF NOT EXISTS llm_call_logs_tenant_ticket_idx
ON llm_call_logs (tenant_id, ticket_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  actor_type text NOT NULL,
  actor_id text,
  action text NOT NULL,
  resource_type text,
  resource_id text,
  decision text,
  input_hash text,
  output_hash text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_logs_actor_type_chk CHECK (
    actor_type IN ('system', 'operator', 'agentops', 'chatwoot', 'tenant_admin', 'developer')
  ),
  CONSTRAINT audit_logs_action_chk CHECK (length(trim(action)) > 0)
);

CREATE INDEX IF NOT EXISTS audit_logs_tenant_created_idx
ON audit_logs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_resource_idx
ON audit_logs (resource_type, resource_id);

COMMENT ON TABLE tenants IS 'Tenant identity and lifecycle root for Phase 1.';
COMMENT ON TABLE chatwoot_connections IS 'Tenant-scoped Chatwoot account, token reference, webhook secret reference, and Agent Bot configuration.';
COMMENT ON TABLE tenant_model_configs IS 'Tenant BYOK model configuration using encrypted key references only.';
COMMENT ON TABLE agent_traces IS 'Trace seed for future agent pipeline, runtime mode, version snapshot, latency, token, and cost fields.';
COMMENT ON TABLE llm_call_logs IS 'Per-call LLM observability and cost seed linked to tenant, ticket, prompt version, model, and trace.';
COMMENT ON TABLE audit_logs IS 'Append-only audit records for actor, action, decision, and input/output hashes.';

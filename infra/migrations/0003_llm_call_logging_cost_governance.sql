-- Phase 1D: reproducible LLM call logs and projected cost governance.

BEGIN;

DROP TRIGGER IF EXISTS llm_call_logs_prevent_mutation
ON llm_call_logs;

ALTER TABLE llm_call_logs
DROP CONSTRAINT IF EXISTS llm_call_logs_tenant_trace_fk;

ALTER TABLE llm_call_logs
DROP CONSTRAINT IF EXISTS llm_call_logs_tenant_model_config_fk;

ALTER TABLE agent_traces
DROP CONSTRAINT IF EXISTS agent_traces_tenant_model_config_fk;

ALTER TABLE IF EXISTS ticket_execution_transitions
DROP CONSTRAINT IF EXISTS ticket_execution_transitions_trace_fk;

ALTER TABLE IF EXISTS runtime_mode_decisions
DROP CONSTRAINT IF EXISTS runtime_mode_decisions_trace_fk;

ALTER TABLE IF EXISTS approval_requests
DROP CONSTRAINT IF EXISTS approval_requests_trace_fk;

ALTER TABLE IF EXISTS approval_requests
DROP CONSTRAINT IF EXISTS approval_requests_model_config_fk;

ALTER TABLE IF EXISTS approval_action_records
DROP CONSTRAINT IF EXISTS approval_action_records_approval_scope_fk;

ALTER TABLE agent_traces
DROP CONSTRAINT IF EXISTS agent_traces_tenant_trace_uniq;

ALTER TABLE agent_traces
ADD CONSTRAINT agent_traces_tenant_trace_uniq
UNIQUE (tenant_id, trace_id);

ALTER TABLE tenant_model_configs
DROP CONSTRAINT IF EXISTS tenant_model_configs_tenant_id_uniq;

ALTER TABLE tenant_model_configs
ADD CONSTRAINT tenant_model_configs_tenant_id_uniq
UNIQUE (tenant_id, id);

ALTER TABLE llm_call_logs
ADD COLUMN IF NOT EXISTS model_config_version_id uuid;

ALTER TABLE llm_call_logs
ADD COLUMN IF NOT EXISTS call_status text NOT NULL DEFAULT 'succeeded';

ALTER TABLE llm_call_logs
ADD COLUMN IF NOT EXISTS input_cost_per_million numeric(12, 6) NOT NULL DEFAULT 0;

ALTER TABLE llm_call_logs
ADD COLUMN IF NOT EXISTS output_cost_per_million numeric(12, 6) NOT NULL DEFAULT 0;

ALTER TABLE llm_call_logs
ADD COLUMN IF NOT EXISTS cost_currency text NOT NULL DEFAULT 'USD';

ALTER TABLE llm_call_logs
ADD COLUMN IF NOT EXISTS total_tokens integer
GENERATED ALWAYS AS (input_tokens + output_tokens) STORED;

UPDATE llm_call_logs
SET budget_reason_code = 'within_budget'
WHERE budget_reason_code IS NULL;

ALTER TABLE llm_call_logs
ALTER COLUMN budget_reason_code SET DEFAULT 'within_budget';

ALTER TABLE llm_call_logs
ALTER COLUMN budget_reason_code SET NOT NULL;

ALTER TABLE llm_call_logs
ALTER COLUMN budget_reason_code DROP DEFAULT;

ALTER TABLE llm_call_logs
ALTER COLUMN call_status DROP DEFAULT;

ALTER TABLE llm_call_logs
ALTER COLUMN input_cost_per_million DROP DEFAULT;

ALTER TABLE llm_call_logs
ALTER COLUMN output_cost_per_million DROP DEFAULT;

ALTER TABLE llm_call_logs
ALTER COLUMN cost_currency DROP DEFAULT;

ALTER TABLE llm_call_logs
ALTER COLUMN trace_id SET NOT NULL;

ALTER TABLE llm_call_logs
ALTER COLUMN model_config_version_id SET NOT NULL;

ALTER TABLE llm_call_logs
ALTER COLUMN prompt_version_id SET NOT NULL;

ALTER TABLE llm_call_logs
ALTER COLUMN latency_ms SET NOT NULL;

ALTER TABLE llm_call_logs
DROP CONSTRAINT IF EXISTS llm_call_logs_trace_id_fkey;

ALTER TABLE llm_call_logs
ADD CONSTRAINT llm_call_logs_tenant_trace_fk
FOREIGN KEY (tenant_id, trace_id)
REFERENCES agent_traces (tenant_id, trace_id)
ON DELETE RESTRICT;

ALTER TABLE llm_call_logs
ADD CONSTRAINT llm_call_logs_tenant_model_config_fk
FOREIGN KEY (tenant_id, model_config_version_id)
REFERENCES tenant_model_configs (tenant_id, id)
ON DELETE RESTRICT;

ALTER TABLE llm_call_logs
DROP CONSTRAINT IF EXISTS llm_call_logs_call_status_chk;

ALTER TABLE llm_call_logs
ADD CONSTRAINT llm_call_logs_call_status_chk
CHECK (call_status IN ('succeeded', 'failed', 'timed_out', 'cancelled'));

ALTER TABLE llm_call_logs
DROP CONSTRAINT IF EXISTS llm_call_logs_provider_canonical_chk;

ALTER TABLE llm_call_logs
ADD CONSTRAINT llm_call_logs_provider_canonical_chk
CHECK (
  model_provider = lower(trim(model_provider)) AND
  length(model_provider) > 0
);

ALTER TABLE llm_call_logs
DROP CONSTRAINT IF EXISTS llm_call_logs_model_canonical_chk;

ALTER TABLE llm_call_logs
ADD CONSTRAINT llm_call_logs_model_canonical_chk
CHECK (model_name = trim(model_name) AND length(model_name) > 0);

ALTER TABLE llm_call_logs
DROP CONSTRAINT IF EXISTS llm_call_logs_prompt_version_chk;

ALTER TABLE llm_call_logs
ADD CONSTRAINT llm_call_logs_prompt_version_chk
CHECK (
  prompt_version_id = trim(prompt_version_id) AND
  length(prompt_version_id) > 0
);

ALTER TABLE llm_call_logs
DROP CONSTRAINT IF EXISTS llm_call_logs_status_error_chk;

ALTER TABLE llm_call_logs
ADD CONSTRAINT llm_call_logs_status_error_chk
CHECK (
  (call_status = 'succeeded' AND error_code IS NULL) OR
  (
    call_status <> 'succeeded' AND
    error_code IS NOT NULL AND
    length(trim(error_code)) > 0
  )
);

ALTER TABLE llm_call_logs
DROP CONSTRAINT IF EXISTS llm_call_logs_cost_currency_chk;

ALTER TABLE llm_call_logs
ADD CONSTRAINT llm_call_logs_cost_currency_chk
CHECK (cost_currency ~ '^[A-Z]{3}$');

ALTER TABLE llm_call_logs
DROP CONSTRAINT IF EXISTS llm_call_logs_input_rate_chk;

ALTER TABLE llm_call_logs
ADD CONSTRAINT llm_call_logs_input_rate_chk
CHECK (input_cost_per_million >= 0);

ALTER TABLE llm_call_logs
DROP CONSTRAINT IF EXISTS llm_call_logs_output_rate_chk;

ALTER TABLE llm_call_logs
ADD CONSTRAINT llm_call_logs_output_rate_chk
CHECK (output_cost_per_million >= 0);

ALTER TABLE llm_call_logs
DROP CONSTRAINT IF EXISTS llm_call_logs_estimate_consistency_chk;

ALTER TABLE llm_call_logs
ADD CONSTRAINT llm_call_logs_estimate_consistency_chk
CHECK (
  estimated_cost =
    round(input_tokens * input_cost_per_million / 1000000, 6) +
    round(output_tokens * output_cost_per_million / 1000000, 6)
);

ALTER TABLE llm_call_logs
DROP CONSTRAINT IF EXISTS llm_call_logs_budget_reason_chk;

ALTER TABLE llm_call_logs
ADD CONSTRAINT llm_call_logs_budget_reason_chk
CHECK (
  budget_reason_code IN (
    'within_budget',
    'ticket_budget_exceeded',
    'daily_budget_exceeded',
    'ticket_and_daily_budget_exceeded'
  )
);

CREATE OR REPLACE FUNCTION prevent_llm_call_log_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'llm call logs are append-only'
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER llm_call_logs_prevent_mutation
BEFORE UPDATE OR DELETE ON llm_call_logs
FOR EACH ROW
EXECUTE FUNCTION prevent_llm_call_log_mutation();

CREATE INDEX IF NOT EXISTS llm_call_logs_tenant_currency_created_idx
ON llm_call_logs (tenant_id, cost_currency, created_at DESC);

CREATE INDEX IF NOT EXISTS llm_call_logs_model_config_idx
ON llm_call_logs (tenant_id, model_config_version_id);

CREATE OR REPLACE VIEW llm_cost_daily_by_tenant AS
SELECT
  tenant_id,
  (created_at AT TIME ZONE 'UTC')::date AS cost_date,
  cost_currency,
  count(*) AS call_count,
  sum(input_tokens)::bigint AS input_tokens,
  sum(output_tokens)::bigint AS output_tokens,
  sum(total_tokens)::bigint AS total_tokens,
  sum(estimated_cost)::numeric(18, 6) AS estimated_cost
FROM llm_call_logs
GROUP BY
  tenant_id,
  (created_at AT TIME ZONE 'UTC')::date,
  cost_currency;

CREATE OR REPLACE VIEW llm_cost_daily_by_ticket AS
SELECT
  tenant_id,
  ticket_id,
  (created_at AT TIME ZONE 'UTC')::date AS cost_date,
  cost_currency,
  count(*) AS call_count,
  sum(input_tokens)::bigint AS input_tokens,
  sum(output_tokens)::bigint AS output_tokens,
  sum(total_tokens)::bigint AS total_tokens,
  sum(estimated_cost)::numeric(18, 6) AS estimated_cost
FROM llm_call_logs
GROUP BY
  tenant_id,
  ticket_id,
  (created_at AT TIME ZONE 'UTC')::date,
  cost_currency;

COMMENT ON COLUMN llm_call_logs.model_config_version_id IS
'Immutable tenant model config version used for this LLM call.';

COMMENT ON COLUMN llm_call_logs.input_cost_per_million IS
'Input-token price snapshot in cost_currency per one million tokens.';

COMMENT ON COLUMN llm_call_logs.output_cost_per_million IS
'Output-token price snapshot in cost_currency per one million tokens.';

COMMENT ON COLUMN llm_call_logs.estimated_cost IS
'Six-decimal estimated call cost calculated from token counts and rate snapshots.';

COMMENT ON VIEW llm_cost_daily_by_tenant IS
'UTC daily tenant LLM usage grouped by currency; currencies are never combined.';

COMMENT ON VIEW llm_cost_daily_by_ticket IS
'UTC daily tenant-ticket LLM usage grouped by currency; currencies are never combined.';

COMMIT;

-- Phase 3B: immutable runtime mode configuration and decision audit.

BEGIN;

CREATE TABLE IF NOT EXISTS runtime_mode_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  version integer NOT NULL,
  allowed_auto_intents text[] NOT NULL,
  max_auto_risk_severity text NOT NULL,
  max_auto_latency_ms integer NOT NULL,
  max_auto_cost_per_ticket numeric(12, 6) NOT NULL,
  auto_downgrade_mode text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  config_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT runtime_mode_configs_tenant_version_uniq
    UNIQUE (tenant_id, version),
  CONSTRAINT runtime_mode_configs_tenant_id_uniq
    UNIQUE (tenant_id, id),
  CONSTRAINT runtime_mode_configs_version_chk CHECK (version > 0),
  CONSTRAINT runtime_mode_configs_intents_chk CHECK (
    cardinality(allowed_auto_intents) > 0 AND
    allowed_auto_intents <@ ARRAY[
      'order_status',
      'logistics_query',
      'refund_eligibility',
      'refund_request',
      'return_policy',
      'invoice_request',
      'complaint_escalation',
      'unknown'
    ]::text[] AND
    text_array_values_unique(allowed_auto_intents)
  ),
  CONSTRAINT runtime_mode_configs_risk_chk
    CHECK (max_auto_risk_severity IN ('P0', 'P1', 'P2', 'P3')),
  CONSTRAINT runtime_mode_configs_latency_chk
    CHECK (max_auto_latency_ms BETWEEN 1 AND 120000),
  CONSTRAINT runtime_mode_configs_cost_chk
    CHECK (max_auto_cost_per_ticket >= 0),
  CONSTRAINT runtime_mode_configs_downgrade_chk
    CHECK (auto_downgrade_mode IN ('shadow', 'assist')),
  CONSTRAINT runtime_mode_configs_hash_chk
    CHECK (config_hash ~ '^[a-f0-9]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS runtime_mode_configs_one_active_idx
ON runtime_mode_configs (tenant_id)
WHERE is_active;

CREATE OR REPLACE FUNCTION prevent_runtime_mode_config_mutation()
RETURNS trigger AS $$
BEGIN
  IF (
    NEW.id,
    NEW.tenant_id,
    NEW.version,
    NEW.allowed_auto_intents,
    NEW.max_auto_risk_severity,
    NEW.max_auto_latency_ms,
    NEW.max_auto_cost_per_ticket,
    NEW.auto_downgrade_mode,
    NEW.config_hash,
    NEW.created_at
  ) IS DISTINCT FROM (
    OLD.id,
    OLD.tenant_id,
    OLD.version,
    OLD.allowed_auto_intents,
    OLD.max_auto_risk_severity,
    OLD.max_auto_latency_ms,
    OLD.max_auto_cost_per_ticket,
    OLD.auto_downgrade_mode,
    OLD.config_hash,
    OLD.created_at
  ) THEN
    RAISE EXCEPTION 'runtime mode config versions are immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS runtime_mode_configs_prevent_mutation
ON runtime_mode_configs;

CREATE TRIGGER runtime_mode_configs_prevent_mutation
BEFORE UPDATE ON runtime_mode_configs
FOR EACH ROW
EXECUTE FUNCTION prevent_runtime_mode_config_mutation();

CREATE TABLE IF NOT EXISTS runtime_mode_decisions (
  decision_id text PRIMARY KEY,
  tenant_id uuid NOT NULL,
  trace_id uuid NOT NULL,
  runtime_config_version_id uuid NOT NULL,
  requested_mode text NOT NULL,
  effective_mode text NOT NULL,
  action text NOT NULL,
  reason_codes text[] NOT NULL,
  blocking boolean NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT runtime_mode_decisions_trace_fk
    FOREIGN KEY (tenant_id, trace_id)
    REFERENCES agent_traces (tenant_id, trace_id)
    ON DELETE CASCADE,
  CONSTRAINT runtime_mode_decisions_config_fk
    FOREIGN KEY (tenant_id, runtime_config_version_id)
    REFERENCES runtime_mode_configs (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT runtime_mode_decisions_mode_chk CHECK (
    requested_mode IN ('shadow', 'assist', 'auto') AND
    effective_mode IN ('shadow', 'assist', 'auto')
  ),
  CONSTRAINT runtime_mode_decisions_action_chk CHECK (
    action IN ('private_note', 'create_approval', 'public_reply', 'handoff')
  ),
  CONSTRAINT runtime_mode_decisions_reasons_chk CHECK (
    cardinality(reason_codes) > 0 AND
    reason_codes <@ ARRAY[
      'shadow_required',
      'assist_required',
      'auto_allowed',
      'risk_blocking',
      'risk_above_auto_threshold',
      'intent_not_auto_allowed',
      'grounding_missing',
      'proposal_unavailable',
      'ticket_budget_exceeded',
      'daily_budget_exceeded',
      'latency_exceeded'
    ]::text[] AND
    text_array_values_unique(reason_codes)
  )
);

ALTER TABLE runtime_mode_decisions
DROP CONSTRAINT IF EXISTS runtime_mode_decisions_trace_fk;

ALTER TABLE runtime_mode_decisions
ADD CONSTRAINT runtime_mode_decisions_trace_fk
FOREIGN KEY (tenant_id, trace_id)
REFERENCES agent_traces (tenant_id, trace_id)
ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION prevent_runtime_mode_decision_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'runtime mode decisions are append-only'
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS runtime_mode_decisions_append_only
ON runtime_mode_decisions;

CREATE TRIGGER runtime_mode_decisions_append_only
BEFORE UPDATE OR DELETE ON runtime_mode_decisions
FOR EACH ROW
EXECUTE FUNCTION prevent_runtime_mode_decision_mutation();

COMMENT ON TABLE runtime_mode_configs IS
'Immutable tenant runtime policy versions controlling Auto eligibility and downgrade.';

COMMENT ON TABLE runtime_mode_decisions IS
'Append-only requested/effective runtime mode and action decisions.';

COMMIT;

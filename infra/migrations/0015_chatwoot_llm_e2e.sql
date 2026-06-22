-- Phase 6B: persistent Chatwoot ingress execution and side-effect records.

BEGIN;

ALTER TABLE canonical_inbound_events
ADD COLUMN IF NOT EXISTS processing_status text NOT NULL DEFAULT 'received';

ALTER TABLE canonical_inbound_events
ADD COLUMN IF NOT EXISTS error_code text;

ALTER TABLE canonical_inbound_events
ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;

ALTER TABLE canonical_inbound_events
ADD COLUMN IF NOT EXISTS processed_at timestamptz;

ALTER TABLE canonical_inbound_events
DROP CONSTRAINT IF EXISTS canonical_inbound_events_processing_chk;

ALTER TABLE canonical_inbound_events
ADD CONSTRAINT canonical_inbound_events_processing_chk CHECK (
  processing_status IN ('received', 'processing', 'completed', 'failed') AND
  (
    (processing_status = 'received' AND processing_started_at IS NULL AND processed_at IS NULL) OR
    (processing_status = 'processing' AND processing_started_at IS NOT NULL AND processed_at IS NULL) OR
    (processing_status IN ('completed', 'failed') AND processing_started_at IS NOT NULL AND processed_at IS NOT NULL)
  ) AND
  (
    (processing_status = 'failed' AND error_code IS NOT NULL) OR
    (processing_status <> 'failed' AND error_code IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS mock_orders (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id text NOT NULL,
  order_id text NOT NULL,
  order_status text NOT NULL,
  logistics_status text NOT NULL,
  tracking_number text,
  refund_eligible boolean NOT NULL,
  refund_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, order_id),
  CONSTRAINT mock_orders_identity_chk CHECK (
    contact_id = trim(contact_id) AND length(contact_id) BETWEEN 1 AND 256 AND
    order_id = trim(order_id) AND length(order_id) BETWEEN 2 AND 128
  ),
  CONSTRAINT mock_orders_status_chk CHECK (
    order_status IN ('paid', 'processing', 'shipped', 'delivered', 'cancelled') AND
    logistics_status IN ('not_shipped', 'in_transit', 'delivered', 'exception')
  )
);

DROP TRIGGER IF EXISTS mock_orders_set_updated_at ON mock_orders;
CREATE TRIGGER mock_orders_set_updated_at
BEFORE UPDATE ON mock_orders
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS mock_orders_contact_idx
ON mock_orders (tenant_id, contact_id);

CREATE TABLE IF NOT EXISTS chatwoot_delivery_attempts (
  delivery_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  trace_id uuid NOT NULL,
  conversation_id text NOT NULL,
  message_type text NOT NULL,
  idempotency_key text NOT NULL,
  input_hash text NOT NULL,
  credential_ref_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  code text,
  provider_message_id text,
  request_hash text NOT NULL,
  response_hash text,
  attempt_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT chatwoot_delivery_attempts_scope_uniq
    UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT chatwoot_delivery_attempts_trace_fk
    FOREIGN KEY (tenant_id, trace_id)
    REFERENCES agent_traces (tenant_id, trace_id)
    ON DELETE CASCADE,
  CONSTRAINT chatwoot_delivery_attempts_type_chk CHECK (
    message_type IN ('private_note', 'public_reply')
  ),
  CONSTRAINT chatwoot_delivery_attempts_status_chk CHECK (
    status IN ('pending', 'succeeded', 'failed') AND
    (
      (status = 'pending' AND code IS NULL AND completed_at IS NULL) OR
      (status <> 'pending' AND code IS NOT NULL AND completed_at IS NOT NULL)
    )
  ),
  CONSTRAINT chatwoot_delivery_attempts_hash_chk CHECK (
    input_hash ~ '^[a-f0-9]{64}$' AND
    credential_ref_hash ~ '^[a-f0-9]{64}$' AND
    request_hash ~ '^[a-f0-9]{64}$' AND
    (response_hash IS NULL OR response_hash ~ '^[a-f0-9]{64}$')
  ),
  CONSTRAINT chatwoot_delivery_attempts_count_chk CHECK (attempt_count > 0)
);

ALTER TABLE chatwoot_delivery_attempts
DROP CONSTRAINT IF EXISTS chatwoot_delivery_attempts_trace_fk;

ALTER TABLE chatwoot_delivery_attempts
ADD CONSTRAINT chatwoot_delivery_attempts_trace_fk
FOREIGN KEY (tenant_id, trace_id)
REFERENCES agent_traces (tenant_id, trace_id)
ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS runtime_execution_audits (
  execution_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  trace_id uuid NOT NULL,
  canonical_event_id uuid NOT NULL,
  runtime_decision_id text,
  outcome text NOT NULL,
  approval_id uuid,
  delivery_id uuid,
  latency_ms integer NOT NULL,
  estimated_cost numeric(12, 6) NOT NULL,
  failure_reason text,
  input_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT runtime_execution_audits_event_uniq
    UNIQUE (tenant_id, canonical_event_id),
  CONSTRAINT runtime_execution_audits_trace_fk
    FOREIGN KEY (tenant_id, trace_id)
    REFERENCES agent_traces (tenant_id, trace_id)
    ON DELETE CASCADE,
  CONSTRAINT runtime_execution_audits_event_fk
    FOREIGN KEY (tenant_id, canonical_event_id)
    REFERENCES canonical_inbound_events (tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT runtime_execution_audits_approval_fk
    FOREIGN KEY (approval_id)
    REFERENCES approval_requests (approval_id)
    ON DELETE SET NULL,
  CONSTRAINT runtime_execution_audits_delivery_fk
    FOREIGN KEY (delivery_id)
    REFERENCES chatwoot_delivery_attempts (delivery_id)
    ON DELETE SET NULL,
  CONSTRAINT runtime_execution_audits_outcome_chk CHECK (
    outcome IN ('private_noted', 'approval_pending', 'replied', 'handed_off', 'failed')
  ),
  CONSTRAINT runtime_execution_audits_hash_chk CHECK (
    input_hash ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT runtime_execution_audits_metrics_chk CHECK (
    latency_ms >= 0 AND estimated_cost >= 0
  )
);

ALTER TABLE runtime_execution_audits
ADD COLUMN IF NOT EXISTS latency_ms integer NOT NULL DEFAULT 0;

ALTER TABLE runtime_execution_audits
ADD COLUMN IF NOT EXISTS estimated_cost numeric(12, 6) NOT NULL DEFAULT 0;

ALTER TABLE runtime_execution_audits
ALTER COLUMN latency_ms DROP DEFAULT;

ALTER TABLE runtime_execution_audits
ALTER COLUMN estimated_cost DROP DEFAULT;

ALTER TABLE runtime_execution_audits
DROP CONSTRAINT IF EXISTS runtime_execution_audits_event_uniq;

ALTER TABLE runtime_execution_audits
ADD CONSTRAINT runtime_execution_audits_event_uniq
UNIQUE (tenant_id, canonical_event_id);

ALTER TABLE runtime_execution_audits
DROP CONSTRAINT IF EXISTS runtime_execution_audits_metrics_chk;

ALTER TABLE runtime_execution_audits
ADD CONSTRAINT runtime_execution_audits_metrics_chk CHECK (
  latency_ms >= 0 AND estimated_cost >= 0
);

ALTER TABLE runtime_execution_audits
DROP CONSTRAINT IF EXISTS runtime_execution_audits_trace_fk;

ALTER TABLE runtime_execution_audits
ADD CONSTRAINT runtime_execution_audits_trace_fk
FOREIGN KEY (tenant_id, trace_id)
REFERENCES agent_traces (tenant_id, trace_id)
ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION prevent_runtime_execution_audit_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'runtime execution audits are append-only'
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS runtime_execution_audits_immutable
ON runtime_execution_audits;
CREATE TRIGGER runtime_execution_audits_immutable
BEFORE UPDATE OR DELETE ON runtime_execution_audits
FOR EACH ROW EXECUTE FUNCTION prevent_runtime_execution_audit_mutation();

INSERT INTO agentops_schema_migrations (version, migration_name)
VALUES (15, '0015_chatwoot_llm_e2e.sql')
ON CONFLICT (version) DO NOTHING;

COMMENT ON TABLE mock_orders IS
'Tenant/contact scoped deterministic business fixtures; real commerce adapters remain out of scope.';
COMMENT ON TABLE chatwoot_delivery_attempts IS
'Persistent Chatwoot side-effect idempotency and safe receipt metadata.';
COMMENT ON TABLE runtime_execution_audits IS
'One safe production runtime outcome record per canonical execution.';

COMMIT;

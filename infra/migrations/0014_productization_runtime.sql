-- Phase 6A: production runtime metadata, canonical events, and async outbox.

BEGIN;

CREATE TABLE IF NOT EXISTS agentops_schema_migrations (
  version integer PRIMARY KEY,
  migration_name text NOT NULL UNIQUE,
  applied_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agentops_schema_migrations_version_chk CHECK (version > 0),
  CONSTRAINT agentops_schema_migrations_name_chk CHECK (
    migration_name = trim(migration_name) AND length(migration_name) > 0
  )
);

CREATE TABLE IF NOT EXISTS canonical_inbound_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source text NOT NULL,
  conversation_id text NOT NULL,
  message_id text NOT NULL,
  event_type text NOT NULL,
  dedupe_key text NOT NULL,
  delivery_keys text[] NOT NULL DEFAULT ARRAY[]::text[],
  payload_hash text NOT NULL,
  is_customer_message boolean NOT NULL,
  is_self_outgoing boolean NOT NULL,
  decision text NOT NULL,
  trace_id uuid,
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT canonical_inbound_events_scope_uniq UNIQUE (tenant_id, id),
  CONSTRAINT canonical_inbound_events_dedupe_uniq UNIQUE (tenant_id, dedupe_key),
  CONSTRAINT canonical_inbound_events_trace_fk
    FOREIGN KEY (tenant_id, trace_id)
    REFERENCES agent_traces (tenant_id, trace_id)
    ON DELETE SET NULL (trace_id),
  CONSTRAINT canonical_inbound_events_source_chk CHECK (
    source IN ('agent_bot', 'account_webhook')
  ),
  CONSTRAINT canonical_inbound_events_identity_chk CHECK (
    conversation_id = trim(conversation_id) AND
    length(conversation_id) BETWEEN 1 AND 256 AND
    message_id = trim(message_id) AND
    length(message_id) BETWEEN 1 AND 256 AND
    event_type = trim(event_type) AND
    length(event_type) BETWEEN 1 AND 128 AND
    dedupe_key = trim(dedupe_key) AND
    length(dedupe_key) BETWEEN 1 AND 1024
  ),
  CONSTRAINT canonical_inbound_events_delivery_keys_chk CHECK (
    text_array_values_unique(delivery_keys)
  ),
  CONSTRAINT canonical_inbound_events_payload_hash_chk CHECK (
    payload_hash ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT canonical_inbound_events_decision_chk CHECK (
    decision IN ('pipeline_seeded', 'duplicate', 'audit_only')
  )
);

CREATE INDEX IF NOT EXISTS canonical_inbound_events_conversation_idx
ON canonical_inbound_events (tenant_id, conversation_id, received_at DESC);

CREATE INDEX IF NOT EXISTS canonical_inbound_events_trace_idx
ON canonical_inbound_events (tenant_id, trace_id)
WHERE trace_id IS NOT NULL;

ALTER TABLE canonical_inbound_events
DROP CONSTRAINT IF EXISTS canonical_inbound_events_trace_fk;

ALTER TABLE canonical_inbound_events
ADD CONSTRAINT canonical_inbound_events_trace_fk
FOREIGN KEY (tenant_id, trace_id)
REFERENCES agent_traces (tenant_id, trace_id)
ON DELETE SET NULL (trace_id);

CREATE TABLE IF NOT EXISTS async_job_outbox (
  outbox_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  job_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text NOT NULL UNIQUE,
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT async_job_outbox_type_chk CHECK (
    job_type IN ('monitor_trace', 'materialize_eval', 'aggregate_dashboard')
  ),
  CONSTRAINT async_job_outbox_aggregate_chk CHECK (
    aggregate_type = trim(aggregate_type) AND
    length(aggregate_type) BETWEEN 1 AND 128 AND
    aggregate_id = trim(aggregate_id) AND
    length(aggregate_id) BETWEEN 1 AND 256
  ),
  CONSTRAINT async_job_outbox_payload_chk CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT async_job_outbox_dedupe_chk CHECK (
    dedupe_key = trim(dedupe_key) AND
    length(dedupe_key) BETWEEN 1 AND 512
  ),
  CONSTRAINT async_job_outbox_attempts_chk CHECK (attempts >= 0),
  CONSTRAINT async_job_outbox_time_chk CHECK (
    published_at IS NULL OR published_at >= created_at
  )
);

CREATE INDEX IF NOT EXISTS async_job_outbox_pending_idx
ON async_job_outbox (available_at, created_at)
WHERE published_at IS NULL;

CREATE TABLE IF NOT EXISTS operational_aggregates (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  aggregate_name text NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  values jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_watermark timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, aggregate_name, window_start, dimensions),
  CONSTRAINT operational_aggregates_name_chk CHECK (
    aggregate_name = trim(aggregate_name) AND
    length(aggregate_name) BETWEEN 1 AND 128
  ),
  CONSTRAINT operational_aggregates_window_chk CHECK (window_end > window_start),
  CONSTRAINT operational_aggregates_json_chk CHECK (
    jsonb_typeof(dimensions) = 'object' AND jsonb_typeof(values) = 'object'
  )
);

INSERT INTO agentops_schema_migrations (version, migration_name)
VALUES
  (1, '0001_phase1_foundation.sql'),
  (2, '0002_tenant_model_config_versions.sql'),
  (3, '0003_llm_call_logging_cost_governance.sql'),
  (4, '0004_pii_mask_trace_schema.sql'),
  (5, '0005_policy_corpus_hybrid_retrieval.sql'),
  (6, '0006_ticket_execution_state_machine.sql'),
  (7, '0007_runtime_mode_decisions.sql'),
  (8, '0008_approval_snapshots.sql'),
  (9, '0009_approval_actions.sql'),
  (10, '0010_eval_foundation.sql'),
  (11, '0011_release_candidates.sql'),
  (12, '0012_release_gate_results.sql'),
  (13, '0013_failure_cases.sql'),
  (14, '0014_productization_runtime.sql')
ON CONFLICT (version) DO NOTHING;

COMMENT ON TABLE canonical_inbound_events IS
'Persisted canonical Chatwoot events; raw payloads are excluded by design.';
COMMENT ON TABLE async_job_outbox IS
'Transactional identifier-only jobs awaiting Redis Streams publication.';
COMMENT ON TABLE operational_aggregates IS
'Materialized tenant operations metrics produced outside the online path.';

COMMIT;

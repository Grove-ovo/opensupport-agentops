-- Phase 6D: asynchronous monitor worker leases, results, and outbox triggers.

BEGIN;

ALTER TABLE async_job_outbox
ADD COLUMN IF NOT EXISTS published_stream_id text;

ALTER TABLE async_job_outbox
ADD COLUMN IF NOT EXISTS last_error_code text;

ALTER TABLE async_job_outbox
DROP CONSTRAINT IF EXISTS async_job_outbox_stream_id_chk;

ALTER TABLE async_job_outbox
ADD CONSTRAINT async_job_outbox_stream_id_chk CHECK (
  published_stream_id IS NULL OR published_stream_id ~ '^[0-9]+-[0-9]+$'
);

CREATE TABLE IF NOT EXISTS async_job_executions (
  job_id uuid PRIMARY KEY,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  job_type text NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  status text NOT NULL,
  attempts integer NOT NULL,
  consumer_name text NOT NULL,
  last_error_code text,
  locked_at timestamptz NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT async_job_executions_type_chk CHECK (
    job_type IN ('monitor_trace', 'materialize_eval', 'aggregate_dashboard')
  ),
  CONSTRAINT async_job_executions_status_chk CHECK (
    status IN ('processing', 'succeeded', 'failed', 'dead_letter') AND
    (
      (status = 'processing' AND completed_at IS NULL AND last_error_code IS NULL) OR
      (status = 'succeeded' AND completed_at IS NOT NULL AND last_error_code IS NULL) OR
      (status IN ('failed', 'dead_letter') AND completed_at IS NOT NULL AND last_error_code IS NOT NULL)
    )
  ),
  CONSTRAINT async_job_executions_attempts_chk CHECK (attempts > 0),
  CONSTRAINT async_job_executions_consumer_chk CHECK (
    consumer_name = trim(consumer_name) AND
    length(consumer_name) BETWEEN 1 AND 128
  )
);

CREATE INDEX IF NOT EXISTS async_job_executions_status_idx
ON async_job_executions (status, locked_at);

CREATE TABLE IF NOT EXISTS monitor_trace_results (
  result_id uuid PRIMARY KEY,
  execution_id uuid NOT NULL UNIQUE,
  tenant_id uuid NOT NULL,
  trace_id uuid NOT NULL,
  outcome text NOT NULL,
  decision text NOT NULL,
  bucket text,
  reason_code text NOT NULL,
  severity text NOT NULL,
  input_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT monitor_trace_results_execution_fk
    FOREIGN KEY (execution_id)
    REFERENCES runtime_execution_audits (execution_id)
    ON DELETE CASCADE,
  CONSTRAINT monitor_trace_results_trace_fk
    FOREIGN KEY (trace_id)
    REFERENCES agent_traces (trace_id)
    ON DELETE CASCADE,
  CONSTRAINT monitor_trace_results_outcome_chk CHECK (
    outcome IN ('private_noted', 'approval_pending', 'replied', 'handed_off', 'failed')
  ),
  CONSTRAINT monitor_trace_results_decision_chk CHECK (
    decision IN ('pass', 'fail')
  ),
  CONSTRAINT monitor_trace_results_bucket_chk CHECK (
    bucket IS NULL OR bucket IN (
      'security', 'grounding', 'retrieval', 'tool', 'risk',
      'latency', 'cost', 'regression', 'quality', 'infrastructure'
    )
  ),
  CONSTRAINT monitor_trace_results_reason_chk CHECK (
    reason_code = trim(reason_code) AND
    length(reason_code) BETWEEN 1 AND 128 AND
    reason_code ~ '^[A-Za-z0-9._:-]+$'
  ),
  CONSTRAINT monitor_trace_results_severity_chk CHECK (
    severity IN ('P0', 'P1', 'P2')
  ),
  CONSTRAINT monitor_trace_results_hash_chk CHECK (
    input_hash ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT monitor_trace_results_consistency_chk CHECK (
    (decision = 'pass' AND bucket IS NULL AND reason_code = 'runtime_healthy') OR
    (decision = 'fail' AND bucket IS NOT NULL AND reason_code <> 'runtime_healthy')
  )
);

CREATE INDEX IF NOT EXISTS monitor_trace_results_tenant_created_idx
ON monitor_trace_results (tenant_id, created_at DESC);

ALTER TABLE monitor_trace_results
DROP CONSTRAINT IF EXISTS monitor_trace_results_trace_fk;

ALTER TABLE monitor_trace_results
ADD CONSTRAINT monitor_trace_results_trace_fk
FOREIGN KEY (trace_id)
REFERENCES agent_traces (trace_id)
ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION guard_monitor_trace_result_scope()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM runtime_execution_audits
    WHERE execution_id = NEW.execution_id
      AND tenant_id = NEW.tenant_id
      AND trace_id = NEW.trace_id
      AND outcome = NEW.outcome
  ) THEN
    RAISE EXCEPTION 'monitor result scope mismatch'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS monitor_trace_results_guard_scope
ON monitor_trace_results;
CREATE TRIGGER monitor_trace_results_guard_scope
BEFORE INSERT ON monitor_trace_results
FOR EACH ROW EXECUTE FUNCTION guard_monitor_trace_result_scope();

CREATE UNIQUE INDEX IF NOT EXISTS failure_cases_eval_reason_uniq
ON failure_cases (tenant_id, eval_case_result_id, reason_code)
WHERE source_type = 'eval_case';

CREATE UNIQUE INDEX IF NOT EXISTS failure_cases_gate_reason_uniq
ON failure_cases (tenant_id, gate_decision_id, reason_code)
WHERE source_type = 'release_gate';

CREATE OR REPLACE FUNCTION agentops_deterministic_uuid(input_value text)
RETURNS uuid AS $$
  SELECT (
    substr(hash_value, 1, 8) || '-' ||
    substr(hash_value, 9, 4) || '-4' ||
    substr(hash_value, 14, 3) || '-a' ||
    substr(hash_value, 18, 3) || '-' ||
    substr(hash_value, 21, 12)
  )::uuid
  FROM (SELECT md5(input_value) AS hash_value) AS hashed;
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;

CREATE OR REPLACE FUNCTION enqueue_runtime_async_jobs()
RETURNS trigger AS $$
BEGIN
  INSERT INTO async_job_outbox (
    tenant_id, job_type, aggregate_type, aggregate_id, dedupe_key
  )
  VALUES (
    NEW.tenant_id,
    'monitor_trace',
    'runtime_execution',
    NEW.execution_id::text,
    'monitor:' || NEW.execution_id::text
  )
  ON CONFLICT (dedupe_key) DO NOTHING;

  INSERT INTO async_job_outbox (
    tenant_id, job_type, aggregate_type, aggregate_id, dedupe_key
  )
  VALUES (
    NEW.tenant_id,
    'aggregate_dashboard',
    'tenant',
    NEW.tenant_id::text,
    'dashboard:' || NEW.execution_id::text
  )
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS runtime_execution_enqueue_async
ON runtime_execution_audits;
CREATE TRIGGER runtime_execution_enqueue_async
AFTER INSERT ON runtime_execution_audits
FOR EACH ROW EXECUTE FUNCTION enqueue_runtime_async_jobs();

CREATE OR REPLACE FUNCTION enqueue_eval_materialization()
RETURNS trigger AS $$
BEGIN
  INSERT INTO async_job_outbox (
    tenant_id, job_type, aggregate_type, aggregate_id, dedupe_key
  )
  VALUES (
    NEW.tenant_id,
    'materialize_eval',
    'release_candidate',
    NEW.candidate_id::text,
    'eval-materialization:' || NEW.candidate_id::text
  )
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS release_gate_enqueue_materialization
ON release_gate_results;
CREATE TRIGGER release_gate_enqueue_materialization
AFTER INSERT ON release_gate_results
FOR EACH ROW EXECUTE FUNCTION enqueue_eval_materialization();

INSERT INTO agentops_schema_migrations (version, migration_name)
VALUES (16, '0016_async_monitor_worker.sql')
ON CONFLICT (version) DO NOTHING;

COMMENT ON TABLE async_job_executions IS
'Durable idempotency and lease state for Redis Stream jobs.';
COMMENT ON TABLE monitor_trace_results IS
'Deterministic safe monitor classifications produced outside the online path.';

COMMIT;

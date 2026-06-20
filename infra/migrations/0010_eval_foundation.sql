-- Phase 4A: immutable replay/security cases, eval runs, and case results.

BEGIN;

CREATE TABLE IF NOT EXISTS eval_cases (
  case_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  dataset_version text NOT NULL,
  dataset_split text NOT NULL,
  masked_input_hash text NOT NULL,
  expected jsonb NOT NULL,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, case_id),
  CONSTRAINT eval_cases_id_chk
    CHECK (case_id ~ '^replay-[0-9]{4}$'),
  CONSTRAINT eval_cases_version_chk CHECK (
    dataset_version = trim(dataset_version) AND
    length(dataset_version) BETWEEN 1 AND 128 AND
    dataset_version ~ '^[A-Za-z0-9._:-]+$'
  ),
  CONSTRAINT eval_cases_split_chk
    CHECK (dataset_split IN ('dev', 'test', 'regression')),
  CONSTRAINT eval_cases_hash_chk
    CHECK (masked_input_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT eval_cases_expected_chk CHECK (
    jsonb_typeof(expected) = 'object' AND
    expected ? 'intent' AND expected ? 'action' AND
    expected ? 'runtime_ceiling'
  ),
  CONSTRAINT eval_cases_tags_chk CHECK (
    cardinality(tags) > 0 AND array_position(tags, NULL) IS NULL
  )
);

CREATE TABLE IF NOT EXISTS security_eval_cases (
  case_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  dataset_version text NOT NULL,
  dataset_split text NOT NULL,
  masked_input_hash text NOT NULL,
  attack_category text NOT NULL,
  p0 boolean NOT NULL,
  expected jsonb NOT NULL,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, case_id),
  CONSTRAINT security_eval_cases_id_chk
    CHECK (case_id ~ '^security-[0-9]{4}$'),
  CONSTRAINT security_eval_cases_version_chk CHECK (
    dataset_version = trim(dataset_version) AND
    length(dataset_version) BETWEEN 1 AND 128 AND
    dataset_version ~ '^[A-Za-z0-9._:-]+$'
  ),
  CONSTRAINT security_eval_cases_split_chk
    CHECK (dataset_split IN ('dev', 'test', 'regression')),
  CONSTRAINT security_eval_cases_hash_chk
    CHECK (masked_input_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT security_eval_cases_category_chk CHECK (
    attack_category IN (
      'prompt_injection',
      'approval_bypass',
      'credential_request',
      'system_prompt_request',
      'unauthorized_order_access',
      'retrieval_injection',
      'unsafe_tool',
      'pii_exfiltration'
    )
  ),
  CONSTRAINT security_eval_cases_expected_chk CHECK (
    jsonb_typeof(expected) = 'object' AND
    expected ? 'required_safe_action' AND
    expected ? 'forbidden_actions'
  ),
  CONSTRAINT security_eval_cases_tags_chk CHECK (
    cardinality(tags) > 0 AND array_position(tags, NULL) IS NULL
  )
);

CREATE TABLE IF NOT EXISTS eval_runs (
  run_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  run_type text NOT NULL,
  dataset_version text NOT NULL,
  dataset_split text NOT NULL,
  candidate_snapshot_hash text NOT NULL,
  baseline_run_id uuid,
  status text NOT NULL,
  metrics jsonb NOT NULL,
  case_result_ids jsonb NOT NULL,
  idempotency_key text NOT NULL,
  input_hash text NOT NULL,
  created_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  CONSTRAINT eval_runs_scope_uniq UNIQUE (tenant_id, run_id),
  CONSTRAINT eval_runs_idempotency_uniq
    UNIQUE (tenant_id, run_type, idempotency_key),
  CONSTRAINT eval_runs_type_chk CHECK (run_type IN ('replay', 'security')),
  CONSTRAINT eval_runs_split_chk
    CHECK (dataset_split IN ('dev', 'test', 'regression')),
  CONSTRAINT eval_runs_status_chk CHECK (status IN ('succeeded', 'failed')),
  CONSTRAINT eval_runs_version_chk CHECK (
    dataset_version = trim(dataset_version) AND
    length(dataset_version) BETWEEN 1 AND 128
  ),
  CONSTRAINT eval_runs_candidate_hash_chk
    CHECK (candidate_snapshot_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT eval_runs_metrics_chk
    CHECK (jsonb_typeof(metrics) = 'object'),
  CONSTRAINT eval_runs_result_ids_chk
    CHECK (jsonb_typeof(case_result_ids) = 'array'),
  CONSTRAINT eval_runs_idempotency_chk CHECK (
    idempotency_key = trim(idempotency_key) AND
    length(idempotency_key) BETWEEN 1 AND 256 AND
    idempotency_key ~ '^[A-Za-z0-9._:-]+$'
  ),
  CONSTRAINT eval_runs_input_hash_chk
    CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT eval_runs_time_chk CHECK (completed_at >= created_at)
);

ALTER TABLE eval_runs
DROP CONSTRAINT IF EXISTS eval_runs_baseline_fk;

ALTER TABLE eval_runs
ADD CONSTRAINT eval_runs_baseline_fk
FOREIGN KEY (tenant_id, baseline_run_id)
REFERENCES eval_runs (tenant_id, run_id);

CREATE TABLE IF NOT EXISTS eval_case_results (
  result_id uuid PRIMARY KEY,
  run_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  case_id text NOT NULL,
  case_kind text NOT NULL,
  passed boolean NOT NULL,
  reason_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  observation jsonb NOT NULL,
  input_hash text NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT eval_case_results_run_case_uniq
    UNIQUE (run_id, case_id),
  CONSTRAINT eval_case_results_run_fk
    FOREIGN KEY (tenant_id, run_id)
    REFERENCES eval_runs (tenant_id, run_id)
    ON DELETE CASCADE,
  CONSTRAINT eval_case_results_kind_chk
    CHECK (case_kind IN ('replay', 'security')),
  CONSTRAINT eval_case_results_case_id_chk CHECK (
    (case_kind = 'replay' AND case_id ~ '^replay-[0-9]{4}$') OR
    (case_kind = 'security' AND case_id ~ '^security-[0-9]{4}$')
  ),
  CONSTRAINT eval_case_results_reasons_chk
    CHECK (array_position(reason_codes, NULL) IS NULL),
  CONSTRAINT eval_case_results_observation_chk
    CHECK (jsonb_typeof(observation) = 'object'),
  CONSTRAINT eval_case_results_hash_chk
    CHECK (input_hash ~ '^[a-f0-9]{64}$')
);

CREATE INDEX IF NOT EXISTS eval_cases_dataset_idx
ON eval_cases (tenant_id, dataset_version, dataset_split);

CREATE INDEX IF NOT EXISTS security_eval_cases_dataset_idx
ON security_eval_cases (tenant_id, dataset_version, dataset_split);

CREATE INDEX IF NOT EXISTS eval_runs_dataset_idx
ON eval_runs (tenant_id, run_type, dataset_version, created_at);

CREATE INDEX IF NOT EXISTS eval_case_results_run_idx
ON eval_case_results (tenant_id, run_id, passed);

CREATE OR REPLACE FUNCTION prevent_eval_record_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'evaluation records are immutable'
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS eval_cases_immutable ON eval_cases;
CREATE TRIGGER eval_cases_immutable
BEFORE UPDATE OR DELETE ON eval_cases
FOR EACH ROW EXECUTE FUNCTION prevent_eval_record_mutation();

DROP TRIGGER IF EXISTS security_eval_cases_immutable ON security_eval_cases;
CREATE TRIGGER security_eval_cases_immutable
BEFORE UPDATE OR DELETE ON security_eval_cases
FOR EACH ROW EXECUTE FUNCTION prevent_eval_record_mutation();

DROP TRIGGER IF EXISTS eval_runs_immutable ON eval_runs;
CREATE TRIGGER eval_runs_immutable
BEFORE UPDATE OR DELETE ON eval_runs
FOR EACH ROW EXECUTE FUNCTION prevent_eval_record_mutation();

DROP TRIGGER IF EXISTS eval_case_results_immutable ON eval_case_results;
CREATE TRIGGER eval_case_results_immutable
BEFORE UPDATE OR DELETE ON eval_case_results
FOR EACH ROW EXECUTE FUNCTION prevent_eval_record_mutation();

COMMENT ON TABLE eval_cases IS
  'Immutable replay evaluation case metadata without customer payloads.';
COMMENT ON TABLE security_eval_cases IS
  'Immutable adversarial evaluation case metadata without secret payloads.';
COMMENT ON TABLE eval_runs IS
  'Immutable completed replay or security evaluation summaries.';
COMMENT ON TABLE eval_case_results IS
  'Immutable normalized case observations and pass/fail reasons.';

COMMIT;

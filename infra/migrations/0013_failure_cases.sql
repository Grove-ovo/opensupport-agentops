-- Phase 4F: safe append-only failure bucket materialization.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS eval_case_results_scope_id_uniq
ON eval_case_results (tenant_id, run_id, result_id);

CREATE UNIQUE INDEX IF NOT EXISTS release_gate_results_scope_id_uniq
ON release_gate_results (tenant_id, candidate_id, result_id);

CREATE UNIQUE INDEX IF NOT EXISTS release_gate_decisions_scope_id_uniq
ON release_gate_decisions (tenant_id, candidate_id, decision_id);

CREATE TABLE IF NOT EXISTS failure_cases (
  failure_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  candidate_id uuid NOT NULL,
  source_type text NOT NULL,
  release_gate_result_id uuid,
  eval_run_id uuid,
  eval_case_result_id uuid,
  case_id text,
  gate_decision_id uuid,
  gate_name text,
  bucket text NOT NULL,
  reason_code text NOT NULL,
  metric_name text,
  metric_value numeric,
  input_hash text NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT failure_cases_candidate_fk
    FOREIGN KEY (tenant_id, candidate_id)
    REFERENCES release_candidates (tenant_id, candidate_id),
  CONSTRAINT failure_cases_eval_run_fk
    FOREIGN KEY (tenant_id, eval_run_id)
    REFERENCES eval_runs (tenant_id, run_id),
  CONSTRAINT failure_cases_eval_result_fk
    FOREIGN KEY (tenant_id, eval_run_id, eval_case_result_id)
    REFERENCES eval_case_results (tenant_id, run_id, result_id),
  CONSTRAINT failure_cases_gate_result_fk
    FOREIGN KEY (tenant_id, candidate_id, release_gate_result_id)
    REFERENCES release_gate_results (tenant_id, candidate_id, result_id),
  CONSTRAINT failure_cases_gate_decision_fk
    FOREIGN KEY (tenant_id, candidate_id, gate_decision_id)
    REFERENCES release_gate_decisions (tenant_id, candidate_id, decision_id),
  CONSTRAINT failure_cases_source_chk CHECK (
    (
      source_type = 'eval_case' AND
      release_gate_result_id IS NULL AND
      eval_run_id IS NOT NULL AND
      eval_case_result_id IS NOT NULL AND
      case_id IS NOT NULL AND
      gate_decision_id IS NULL AND
      gate_name IS NULL
    ) OR
    (
      source_type = 'release_gate' AND
      release_gate_result_id IS NOT NULL AND
      eval_run_id IS NOT NULL AND
      eval_case_result_id IS NULL AND
      case_id IS NULL AND
      gate_decision_id IS NOT NULL AND
      gate_name IS NOT NULL
    )
  ),
  CONSTRAINT failure_cases_case_id_chk CHECK (
    case_id IS NULL OR
    case_id ~ '^(replay|security)-[0-9]{4}$'
  ),
  CONSTRAINT failure_cases_gate_name_chk CHECK (
    gate_name IS NULL OR gate_name IN (
      'task_success_regression',
      'high_risk_escalation_recall',
      'replay_unsafe_action_rate',
      'no_evidence_answer_rate',
      'retrieval_recall_at_5',
      'p95_latency_ms',
      'average_cost_per_ticket',
      'security_p0',
      'security_unsafe_action_rate',
      'security_pii_leak_rate',
      'security_unauthorized_access_rate'
    )
  ),
  CONSTRAINT failure_cases_bucket_chk CHECK (
    bucket IN (
      'security',
      'grounding',
      'retrieval',
      'tool',
      'risk',
      'latency',
      'cost',
      'regression',
      'quality',
      'infrastructure'
    )
  ),
  CONSTRAINT failure_cases_reason_chk CHECK (
    reason_code = trim(reason_code) AND
    length(reason_code) BETWEEN 1 AND 128 AND
    reason_code ~ '^[A-Za-z0-9._:-]+$'
  ),
  CONSTRAINT failure_cases_metric_chk CHECK (
    metric_name IS NULL OR (
      metric_name = trim(metric_name) AND
      length(metric_name) BETWEEN 1 AND 128 AND
      metric_name ~ '^[A-Za-z0-9._:-]+$'
    )
  ),
  CONSTRAINT failure_cases_input_hash_chk
    CHECK (input_hash ~ '^[a-f0-9]{64}$')
);

CREATE INDEX IF NOT EXISTS failure_cases_bucket_created_idx
ON failure_cases (tenant_id, bucket, created_at);

CREATE INDEX IF NOT EXISTS failure_cases_candidate_idx
ON failure_cases (tenant_id, candidate_id, source_type);

CREATE OR REPLACE FUNCTION prevent_failure_case_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'failure cases are append-only'
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS failure_cases_append_only ON failure_cases;
CREATE TRIGGER failure_cases_append_only
BEFORE UPDATE OR DELETE ON failure_cases
FOR EACH ROW EXECUTE FUNCTION prevent_failure_case_mutation();

COMMENT ON TABLE failure_cases IS
'Safe failure references and metrics only; source payloads are excluded by schema.';

COMMIT;

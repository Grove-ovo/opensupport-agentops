-- Phase 4E: immutable release gate decisions and atomic promotion.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS release_candidate_transitions_scope_id_uniq
ON release_candidate_transitions (tenant_id, candidate_id, transition_id);

CREATE TABLE IF NOT EXISTS release_gate_results (
  result_id uuid PRIMARY KEY,
  candidate_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  candidate_snapshot_hash text NOT NULL,
  replay_eval_run_id uuid NOT NULL,
  security_eval_run_id uuid NOT NULL,
  promotion_state text NOT NULL,
  transition_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  input_hash text NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT release_gate_results_candidate_uniq
    UNIQUE (tenant_id, candidate_id),
  CONSTRAINT release_gate_results_idempotency_uniq
    UNIQUE (tenant_id, candidate_id, idempotency_key),
  CONSTRAINT release_gate_results_candidate_fk
    FOREIGN KEY (tenant_id, candidate_id)
    REFERENCES release_candidates (tenant_id, candidate_id),
  CONSTRAINT release_gate_results_replay_run_fk
    FOREIGN KEY (tenant_id, replay_eval_run_id)
    REFERENCES eval_runs (tenant_id, run_id),
  CONSTRAINT release_gate_results_security_run_fk
    FOREIGN KEY (tenant_id, security_eval_run_id)
    REFERENCES eval_runs (tenant_id, run_id),
  CONSTRAINT release_gate_results_transition_fk
    FOREIGN KEY (tenant_id, candidate_id, transition_id)
    REFERENCES release_candidate_transitions (
      tenant_id, candidate_id, transition_id
    ),
  CONSTRAINT release_gate_results_snapshot_hash_chk
    CHECK (candidate_snapshot_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT release_gate_results_promotion_chk
    CHECK (promotion_state IN ('failed', 'shadow', 'assist', 'auto')),
  CONSTRAINT release_gate_results_idempotency_chk CHECK (
    idempotency_key = trim(idempotency_key) AND
    length(idempotency_key) BETWEEN 1 AND 256 AND
    idempotency_key ~ '^[A-Za-z0-9._:-]+$'
  ),
  CONSTRAINT release_gate_results_input_hash_chk
    CHECK (input_hash ~ '^[a-f0-9]{64}$')
);

CREATE TABLE IF NOT EXISTS release_gate_decisions (
  decision_id uuid PRIMARY KEY,
  result_id uuid NOT NULL,
  candidate_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  gate_name text NOT NULL,
  decision text NOT NULL,
  actual_value jsonb NOT NULL,
  threshold_operator text NOT NULL,
  threshold_value jsonb NOT NULL,
  reason_code text NOT NULL,
  severity text NOT NULL,
  blocking boolean NOT NULL,
  promotion_ceiling text NOT NULL,
  input_hash text NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT release_gate_decisions_gate_uniq
    UNIQUE (result_id, gate_name),
  CONSTRAINT release_gate_decisions_result_fk
    FOREIGN KEY (result_id)
    REFERENCES release_gate_results (result_id),
  CONSTRAINT release_gate_decisions_candidate_fk
    FOREIGN KEY (tenant_id, candidate_id)
    REFERENCES release_candidates (tenant_id, candidate_id),
  CONSTRAINT release_gate_decisions_name_chk CHECK (
    gate_name IN (
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
  CONSTRAINT release_gate_decisions_decision_chk
    CHECK (decision IN ('pass', 'fail')),
  CONSTRAINT release_gate_decisions_actual_chk
    CHECK (jsonb_typeof(actual_value) IN ('number', 'boolean')),
  CONSTRAINT release_gate_decisions_operator_chk
    CHECK (threshold_operator IN ('gte', 'lte', 'eq', 'is_true')),
  CONSTRAINT release_gate_decisions_threshold_chk
    CHECK (jsonb_typeof(threshold_value) IN ('number', 'boolean')),
  CONSTRAINT release_gate_decisions_reason_chk CHECK (
    reason_code IN (
      'within_threshold',
      'task_success_regression',
      'escalation_recall_below_threshold',
      'unsafe_action_detected',
      'no_evidence_rate_exceeded',
      'retrieval_recall_below_threshold',
      'latency_budget_exceeded',
      'cost_budget_exceeded',
      'security_p0_failed',
      'pii_leak_detected',
      'unauthorized_access_detected'
    )
  ),
  CONSTRAINT release_gate_decisions_severity_chk
    CHECK (severity IN ('P0', 'P1', 'P2')),
  CONSTRAINT release_gate_decisions_ceiling_chk
    CHECK (promotion_ceiling IN ('failed', 'shadow', 'assist', 'auto')),
  CONSTRAINT release_gate_decisions_consistency_chk CHECK (
    (decision = 'pass' AND reason_code = 'within_threshold' AND
      blocking = false AND promotion_ceiling = 'auto') OR
    (decision = 'fail' AND reason_code <> 'within_threshold' AND
      blocking = true)
  ),
  CONSTRAINT release_gate_decisions_input_hash_chk
    CHECK (input_hash ~ '^[a-f0-9]{64}$')
);

CREATE INDEX IF NOT EXISTS release_gate_decisions_candidate_idx
ON release_gate_decisions (tenant_id, candidate_id, gate_name);

CREATE OR REPLACE FUNCTION guard_release_gate_insert()
RETURNS trigger AS $$
DECLARE
  result_id_setting text;
BEGIN
  result_id_setting :=
    nullif(current_setting('opensupport.release_gate_result_id', true), '');
  IF result_id_setting IS NULL OR result_id_setting::uuid <> NEW.result_id THEN
    RAISE EXCEPTION 'release gate records must use apply_release_gate'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS release_gate_results_guard_insert
ON release_gate_results;
CREATE TRIGGER release_gate_results_guard_insert
BEFORE INSERT ON release_gate_results
FOR EACH ROW EXECUTE FUNCTION guard_release_gate_insert();

DROP TRIGGER IF EXISTS release_gate_decisions_guard_insert
ON release_gate_decisions;
CREATE TRIGGER release_gate_decisions_guard_insert
BEFORE INSERT ON release_gate_decisions
FOR EACH ROW EXECUTE FUNCTION guard_release_gate_insert();

CREATE OR REPLACE FUNCTION prevent_release_gate_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'release gate records are immutable'
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS release_gate_results_immutable
ON release_gate_results;
CREATE TRIGGER release_gate_results_immutable
BEFORE UPDATE OR DELETE ON release_gate_results
FOR EACH ROW EXECUTE FUNCTION prevent_release_gate_mutation();

DROP TRIGGER IF EXISTS release_gate_decisions_immutable
ON release_gate_decisions;
CREATE TRIGGER release_gate_decisions_immutable
BEFORE UPDATE OR DELETE ON release_gate_decisions
FOR EACH ROW EXECUTE FUNCTION prevent_release_gate_mutation();

CREATE OR REPLACE FUNCTION apply_release_gate(
  input_result_id uuid,
  input_tenant_id uuid,
  input_candidate_id uuid,
  input_candidate_snapshot_hash text,
  input_replay_eval_run_id uuid,
  input_security_eval_run_id uuid,
  input_promotion_state text,
  input_idempotency_key text,
  input_hash text,
  input_decisions jsonb,
  input_created_at timestamptz DEFAULT now()
)
RETURNS release_gate_results AS $$
DECLARE
  candidate_record release_candidates%ROWTYPE;
  existing_result release_gate_results%ROWTYPE;
  inserted_result release_gate_results%ROWTYPE;
  transition_record release_candidate_transitions%ROWTYPE;
  target_reason text;
  gate_count integer;
  unique_gate_count integer;
BEGIN
  SELECT *
  INTO existing_result
  FROM release_gate_results
  WHERE
    tenant_id = input_tenant_id AND
    candidate_id = input_candidate_id AND
    idempotency_key = input_idempotency_key;

  IF FOUND THEN
    IF
      existing_result.result_id <> input_result_id OR
      existing_result.candidate_snapshot_hash <>
        input_candidate_snapshot_hash OR
      existing_result.replay_eval_run_id <> input_replay_eval_run_id OR
      existing_result.security_eval_run_id <> input_security_eval_run_id OR
      existing_result.promotion_state <> input_promotion_state OR
      existing_result.input_hash <> input_hash
    THEN
      RAISE EXCEPTION 'release gate idempotency conflict'
        USING ERRCODE = 'unique_violation';
    END IF;
    RETURN existing_result;
  END IF;

  SELECT *
  INTO candidate_record
  FROM release_candidates
  WHERE
    tenant_id = input_tenant_id AND
    candidate_id = input_candidate_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'release candidate not found'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF candidate_record.state <> 'evaluating' THEN
    RAISE EXCEPTION 'release candidate is not evaluating'
      USING ERRCODE = 'serialization_failure';
  END IF;

  IF
    candidate_record.snapshot_hash <> input_candidate_snapshot_hash OR
    candidate_record.replay_eval_run_id <> input_replay_eval_run_id OR
    candidate_record.security_eval_run_id <> input_security_eval_run_id
  THEN
    RAISE EXCEPTION 'release gate evidence mismatch'
      USING ERRCODE = 'check_violation';
  END IF;

  IF
    input_promotion_state NOT IN ('failed', 'shadow', 'assist', 'auto') OR
    jsonb_typeof(input_decisions) <> 'array'
  THEN
    RAISE EXCEPTION 'invalid release gate input'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*), count(DISTINCT decision.gate_name)
  INTO gate_count, unique_gate_count
  FROM jsonb_to_recordset(input_decisions) AS decision(gate_name text);

  IF gate_count <> 11 OR unique_gate_count <> 11 THEN
    RAISE EXCEPTION 'release gate requires 11 unique decisions'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(input_decisions) AS decision(
      decision text,
      severity text,
      promotion_ceiling text
    )
    WHERE
      decision.decision = 'fail' AND
      decision.severity = 'P0' AND
      input_promotion_state <> 'failed'
  ) THEN
    RAISE EXCEPTION 'P0 release gate failure must fail the candidate'
      USING ERRCODE = 'check_violation';
  END IF;

  IF input_promotion_state = 'auto' AND EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(input_decisions) AS decision(decision text)
    WHERE decision.decision = 'fail'
  ) THEN
    RAISE EXCEPTION 'Auto promotion requires every gate to pass'
      USING ERRCODE = 'check_violation';
  END IF;

  target_reason := CASE input_promotion_state
    WHEN 'failed' THEN 'evaluation_failed'
    WHEN 'shadow' THEN 'promoted_shadow'
    WHEN 'assist' THEN 'promoted_assist'
    WHEN 'auto' THEN 'promoted_auto'
  END;

  SELECT * INTO transition_record
  FROM transition_release_candidate(
    input_tenant_id,
    input_candidate_id,
    'evaluating',
    input_promotion_state,
    target_reason,
    'system',
    NULL,
    'gate:' || input_idempotency_key,
    input_hash,
    input_created_at
  );

  PERFORM set_config(
    'opensupport.release_gate_result_id',
    input_result_id::text,
    true
  );

  INSERT INTO release_gate_results (
    result_id,
    candidate_id,
    tenant_id,
    candidate_snapshot_hash,
    replay_eval_run_id,
    security_eval_run_id,
    promotion_state,
    transition_id,
    idempotency_key,
    input_hash,
    created_at
  )
  VALUES (
    input_result_id,
    input_candidate_id,
    input_tenant_id,
    input_candidate_snapshot_hash,
    input_replay_eval_run_id,
    input_security_eval_run_id,
    input_promotion_state,
    transition_record.transition_id,
    input_idempotency_key,
    input_hash,
    input_created_at
  )
  RETURNING * INTO inserted_result;

  INSERT INTO release_gate_decisions (
    decision_id,
    result_id,
    candidate_id,
    tenant_id,
    gate_name,
    decision,
    actual_value,
    threshold_operator,
    threshold_value,
    reason_code,
    severity,
    blocking,
    promotion_ceiling,
    input_hash,
    created_at
  )
  SELECT
    decision.decision_id,
    input_result_id,
    input_candidate_id,
    input_tenant_id,
    decision.gate_name,
    decision.decision,
    decision.actual_value,
    decision.threshold_operator,
    decision.threshold_value,
    decision.reason_code,
    decision.severity,
    decision.blocking,
    decision.promotion_ceiling,
    decision.input_hash,
    input_created_at
  FROM jsonb_to_recordset(input_decisions) AS decision(
    decision_id uuid,
    gate_name text,
    decision text,
    actual_value jsonb,
    threshold_operator text,
    threshold_value jsonb,
    reason_code text,
    severity text,
    blocking boolean,
    promotion_ceiling text,
    input_hash text
  );

  PERFORM set_config('opensupport.release_gate_result_id', '', true);
  RETURN inserted_result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE release_gate_results IS
'Immutable release decision tied to one candidate snapshot and exact Eval Runs.';
COMMENT ON TABLE release_gate_decisions IS
'Exactly one immutable threshold decision per required release gate check.';

COMMIT;

-- Phase 4D: immutable release candidate snapshots and guarded transitions.

BEGIN;

CREATE TABLE IF NOT EXISTS release_candidates (
  candidate_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_version_id text NOT NULL,
  prompt_version_id text NOT NULL,
  policy_version_id text NOT NULL,
  tool_manifest_version_id text NOT NULL,
  risk_rule_version_id text NOT NULL,
  retrieval_config_version_id text NOT NULL,
  model_config_version_id text NOT NULL,
  replay_eval_run_id uuid NOT NULL,
  security_eval_run_id uuid NOT NULL,
  config_snapshot_hash text NOT NULL,
  snapshot_hash text NOT NULL,
  state text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT release_candidates_scope_uniq UNIQUE (tenant_id, candidate_id),
  CONSTRAINT release_candidates_replay_run_fk
    FOREIGN KEY (tenant_id, replay_eval_run_id)
    REFERENCES eval_runs (tenant_id, run_id),
  CONSTRAINT release_candidates_security_run_fk
    FOREIGN KEY (tenant_id, security_eval_run_id)
    REFERENCES eval_runs (tenant_id, run_id),
  CONSTRAINT release_candidates_eval_runs_chk
    CHECK (replay_eval_run_id <> security_eval_run_id),
  CONSTRAINT release_candidates_state_chk CHECK (
    state IN (
      'draft', 'evaluating', 'failed', 'shadow', 'assist', 'auto', 'archived'
    )
  ),
  CONSTRAINT release_candidates_versions_chk CHECK (
    agent_version_id ~ '^[A-Za-z0-9._:-]{1,128}$' AND
    prompt_version_id ~ '^[A-Za-z0-9._:-]{1,128}$' AND
    policy_version_id ~ '^[A-Za-z0-9._:-]{1,128}$' AND
    tool_manifest_version_id ~ '^[A-Za-z0-9._:-]{1,128}$' AND
    risk_rule_version_id ~ '^[A-Za-z0-9._:-]{1,128}$' AND
    retrieval_config_version_id ~ '^[A-Za-z0-9._:-]{1,128}$' AND
    model_config_version_id ~ '^[A-Za-z0-9._:-]{1,128}$'
  ),
  CONSTRAINT release_candidates_config_hash_chk
    CHECK (config_snapshot_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT release_candidates_snapshot_hash_chk
    CHECK (snapshot_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT release_candidates_time_chk CHECK (updated_at >= created_at)
);

CREATE TABLE IF NOT EXISTS release_candidate_transitions (
  transition_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  from_state text NOT NULL,
  to_state text NOT NULL,
  reason_code text NOT NULL,
  actor_type text NOT NULL,
  actor_id text,
  idempotency_key text NOT NULL,
  input_hash text NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT release_candidate_transitions_candidate_fk
    FOREIGN KEY (tenant_id, candidate_id)
    REFERENCES release_candidates (tenant_id, candidate_id),
  CONSTRAINT release_candidate_transitions_idempotency_uniq
    UNIQUE (tenant_id, candidate_id, idempotency_key),
  CONSTRAINT release_candidate_transitions_state_chk CHECK (
    from_state IN (
      'draft', 'evaluating', 'failed', 'shadow', 'assist', 'auto', 'archived'
    ) AND
    to_state IN (
      'draft', 'evaluating', 'failed', 'shadow', 'assist', 'auto', 'archived'
    ) AND
    from_state <> to_state
  ),
  CONSTRAINT release_candidate_transitions_reason_chk CHECK (
    reason_code IN (
      'evaluation_started',
      'evaluation_failed',
      'promoted_shadow',
      'promoted_assist',
      'promoted_auto',
      'candidate_archived'
    )
  ),
  CONSTRAINT release_candidate_transitions_actor_chk CHECK (
    actor_type IN ('system', 'operator', 'scheduler') AND
    (
      (actor_type = 'operator' AND actor_id IS NOT NULL) OR
      actor_type <> 'operator'
    ) AND
    (
      actor_id IS NULL OR
      (actor_id = trim(actor_id) AND length(actor_id) BETWEEN 1 AND 256)
    )
  ),
  CONSTRAINT release_candidate_transitions_idempotency_chk CHECK (
    idempotency_key = trim(idempotency_key) AND
    length(idempotency_key) BETWEEN 1 AND 256 AND
    idempotency_key ~ '^[A-Za-z0-9._:-]+$'
  ),
  CONSTRAINT release_candidate_transitions_input_hash_chk
    CHECK (input_hash ~ '^[a-f0-9]{64}$')
);

CREATE INDEX IF NOT EXISTS release_candidates_state_idx
ON release_candidates (tenant_id, state, created_at);

CREATE INDEX IF NOT EXISTS release_candidate_transitions_created_idx
ON release_candidate_transitions (tenant_id, candidate_id, created_at);

CREATE OR REPLACE FUNCTION validate_release_candidate_eval_scope()
RETURNS trigger AS $$
DECLARE
  replay_run eval_runs%ROWTYPE;
  security_run eval_runs%ROWTYPE;
BEGIN
  SELECT * INTO replay_run
  FROM eval_runs
  WHERE tenant_id = NEW.tenant_id AND run_id = NEW.replay_eval_run_id;

  SELECT * INTO security_run
  FROM eval_runs
  WHERE tenant_id = NEW.tenant_id AND run_id = NEW.security_eval_run_id;

  IF
    replay_run.run_type IS DISTINCT FROM 'replay' OR
    replay_run.status IS DISTINCT FROM 'succeeded' OR
    replay_run.candidate_snapshot_hash IS DISTINCT FROM
      NEW.config_snapshot_hash OR
    security_run.run_type IS DISTINCT FROM 'security' OR
    security_run.status IS DISTINCT FROM 'succeeded' OR
    security_run.candidate_snapshot_hash IS DISTINCT FROM
      NEW.config_snapshot_hash
  THEN
    RAISE EXCEPTION 'release candidate eval scope mismatch'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS release_candidates_validate_eval_scope
ON release_candidates;

CREATE TRIGGER release_candidates_validate_eval_scope
BEFORE INSERT ON release_candidates
FOR EACH ROW
EXECUTE FUNCTION validate_release_candidate_eval_scope();

CREATE OR REPLACE FUNCTION is_release_candidate_transition_allowed(
  input_from_state text,
  input_to_state text,
  input_reason_code text
)
RETURNS boolean AS $$
  SELECT CASE
    WHEN input_from_state = 'draft' THEN
      (input_to_state, input_reason_code) =
        ('evaluating', 'evaluation_started')
    WHEN input_from_state = 'evaluating' THEN
      (input_to_state, input_reason_code) IN (
        ('failed', 'evaluation_failed'),
        ('shadow', 'promoted_shadow'),
        ('assist', 'promoted_assist'),
        ('auto', 'promoted_auto')
      )
    WHEN input_from_state IN ('failed', 'shadow', 'assist', 'auto') THEN
      (input_to_state, input_reason_code) =
        ('archived', 'candidate_archived')
    ELSE false
  END;
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;

ALTER TABLE release_candidate_transitions
DROP CONSTRAINT IF EXISTS release_candidate_transitions_rule_chk;

ALTER TABLE release_candidate_transitions
ADD CONSTRAINT release_candidate_transitions_rule_chk CHECK (
  is_release_candidate_transition_allowed(from_state, to_state, reason_code)
);

CREATE OR REPLACE FUNCTION prevent_release_candidate_transition_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'release candidate transitions are append-only'
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS release_candidate_transitions_append_only
ON release_candidate_transitions;

CREATE TRIGGER release_candidate_transitions_append_only
BEFORE UPDATE OR DELETE ON release_candidate_transitions
FOR EACH ROW
EXECUTE FUNCTION prevent_release_candidate_transition_mutation();

CREATE OR REPLACE FUNCTION guard_release_candidate_mutation()
RETURNS trigger AS $$
DECLARE
  transition_id_setting text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'release candidate snapshots are immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF (
    NEW.candidate_id,
    NEW.tenant_id,
    NEW.agent_version_id,
    NEW.prompt_version_id,
    NEW.policy_version_id,
    NEW.tool_manifest_version_id,
    NEW.risk_rule_version_id,
    NEW.retrieval_config_version_id,
    NEW.model_config_version_id,
    NEW.replay_eval_run_id,
    NEW.security_eval_run_id,
    NEW.config_snapshot_hash,
    NEW.snapshot_hash,
    NEW.created_at
  ) IS DISTINCT FROM (
    OLD.candidate_id,
    OLD.tenant_id,
    OLD.agent_version_id,
    OLD.prompt_version_id,
    OLD.policy_version_id,
    OLD.tool_manifest_version_id,
    OLD.risk_rule_version_id,
    OLD.retrieval_config_version_id,
    OLD.model_config_version_id,
    OLD.replay_eval_run_id,
    OLD.security_eval_run_id,
    OLD.config_snapshot_hash,
    OLD.snapshot_hash,
    OLD.created_at
  ) THEN
    RAISE EXCEPTION 'release candidate snapshots are immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF
    NEW.state IS NOT DISTINCT FROM OLD.state AND
    NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at
  THEN
    RETURN NEW;
  END IF;

  transition_id_setting :=
    nullif(current_setting('opensupport.release_transition_id', true), '');

  IF transition_id_setting IS NULL OR NOT EXISTS (
    SELECT 1
    FROM release_candidate_transitions AS transition
    WHERE
      transition.transition_id = transition_id_setting::uuid AND
      transition.tenant_id = OLD.tenant_id AND
      transition.candidate_id = OLD.candidate_id AND
      transition.from_state = OLD.state AND
      transition.to_state = NEW.state AND
      transition.created_at = NEW.updated_at
  ) THEN
    RAISE EXCEPTION
      'release candidate state must use transition_release_candidate'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS release_candidates_guard_mutation
ON release_candidates;

CREATE TRIGGER release_candidates_guard_mutation
BEFORE UPDATE OR DELETE ON release_candidates
FOR EACH ROW
EXECUTE FUNCTION guard_release_candidate_mutation();

CREATE OR REPLACE FUNCTION transition_release_candidate(
  input_tenant_id uuid,
  input_candidate_id uuid,
  input_expected_state text,
  input_next_state text,
  input_reason_code text,
  input_actor_type text,
  input_actor_id text,
  input_idempotency_key text,
  input_hash text,
  input_created_at timestamptz DEFAULT now()
)
RETURNS release_candidate_transitions AS $$
DECLARE
  existing_transition release_candidate_transitions%ROWTYPE;
  current_state text;
  inserted_transition release_candidate_transitions%ROWTYPE;
BEGIN
  SELECT state
  INTO current_state
  FROM release_candidates
  WHERE
    tenant_id = input_tenant_id AND
    candidate_id = input_candidate_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'release candidate not found'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT *
  INTO existing_transition
  FROM release_candidate_transitions
  WHERE
    tenant_id = input_tenant_id AND
    candidate_id = input_candidate_id AND
    idempotency_key = input_idempotency_key;

  IF FOUND THEN
    IF
      existing_transition.from_state <> input_expected_state OR
      existing_transition.to_state <> input_next_state OR
      existing_transition.reason_code <> input_reason_code OR
      existing_transition.actor_type <> input_actor_type OR
      existing_transition.actor_id IS DISTINCT FROM input_actor_id OR
      existing_transition.input_hash <> input_hash
    THEN
      RAISE EXCEPTION 'release candidate idempotency conflict'
        USING ERRCODE = 'unique_violation';
    END IF;
    RETURN existing_transition;
  END IF;

  IF current_state <> input_expected_state THEN
    RAISE EXCEPTION
      'release candidate stale state: expected %, found %',
      input_expected_state,
      current_state
      USING ERRCODE = 'serialization_failure';
  END IF;

  IF NOT is_release_candidate_transition_allowed(
    input_expected_state,
    input_next_state,
    input_reason_code
  ) THEN
    RAISE EXCEPTION
      'invalid release candidate transition: % -> % (%)',
      input_expected_state,
      input_next_state,
      input_reason_code
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO release_candidate_transitions (
    candidate_id,
    tenant_id,
    from_state,
    to_state,
    reason_code,
    actor_type,
    actor_id,
    idempotency_key,
    input_hash,
    created_at
  )
  VALUES (
    input_candidate_id,
    input_tenant_id,
    input_expected_state,
    input_next_state,
    input_reason_code,
    input_actor_type,
    input_actor_id,
    input_idempotency_key,
    input_hash,
    input_created_at
  )
  RETURNING *
  INTO inserted_transition;

  PERFORM set_config(
    'opensupport.release_transition_id',
    inserted_transition.transition_id::text,
    true
  );

  UPDATE release_candidates
  SET state = input_next_state, updated_at = input_created_at
  WHERE
    tenant_id = input_tenant_id AND
    candidate_id = input_candidate_id AND
    state = input_expected_state;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'release candidate state changed concurrently'
      USING ERRCODE = 'serialization_failure';
  END IF;

  PERFORM set_config('opensupport.release_transition_id', '', true);
  RETURN inserted_transition;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE release_candidates IS
'Immutable seven-version release snapshots pinned to exact replay/security runs.';
COMMENT ON TABLE release_candidate_transitions IS
'Append-only guarded release candidate state changes.';

COMMIT;

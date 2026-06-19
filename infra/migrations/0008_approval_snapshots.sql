-- Phase 3D: immutable approval snapshots and atomic pending creation.

BEGIN;

CREATE TABLE IF NOT EXISTS approval_requests (
  approval_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  trace_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'pending',
  suggested_reply text NOT NULL,
  evidence_refs text[] NOT NULL,
  tool_result_refs text[] NOT NULL,
  risk_reason text NOT NULL,
  generated_action text NOT NULL,
  agent_version_id text NOT NULL,
  prompt_version_id text NOT NULL,
  policy_version_id text NOT NULL,
  tool_manifest_version_id text NOT NULL,
  risk_rule_version_id text NOT NULL,
  retrieval_config_version_id text NOT NULL,
  model_config_version_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  idempotency_key text NOT NULL,
  input_hash text NOT NULL,
  approver_action text,
  approver_id text,
  edited_reply text,
  edit_distance numeric(8, 6),
  action_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT approval_requests_trace_fk
    FOREIGN KEY (tenant_id, trace_id)
    REFERENCES agent_traces (tenant_id, trace_id)
    ON DELETE CASCADE,
  CONSTRAINT approval_requests_model_config_fk
    FOREIGN KEY (tenant_id, model_config_version_id)
    REFERENCES tenant_model_configs (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT approval_requests_trace_uniq UNIQUE (tenant_id, trace_id),
  CONSTRAINT approval_requests_idempotency_uniq
    UNIQUE (tenant_id, trace_id, idempotency_key),
  CONSTRAINT approval_requests_state_chk CHECK (
    state IN ('pending', 'approved', 'edited', 'rejected', 'escalated', 'expired')
  ),
  CONSTRAINT approval_requests_snapshot_chk CHECK (
    suggested_reply = trim(suggested_reply) AND
    length(suggested_reply) BETWEEN 1 AND 20000 AND
    cardinality(evidence_refs) + cardinality(tool_result_refs) > 0 AND
    text_array_values_unique(evidence_refs) AND
    text_array_values_unique(tool_result_refs) AND
    risk_reason = trim(risk_reason) AND
    length(risk_reason) BETWEEN 1 AND 1000 AND
    generated_action = 'public_reply' AND
    length(agent_version_id) > 0 AND
    length(prompt_version_id) > 0 AND
    length(policy_version_id) > 0 AND
    length(tool_manifest_version_id) > 0 AND
    length(risk_rule_version_id) > 0 AND
    length(retrieval_config_version_id) > 0 AND
    expires_at > created_at
  ),
  CONSTRAINT approval_requests_idempotency_chk CHECK (
    idempotency_key = trim(idempotency_key) AND
    length(idempotency_key) BETWEEN 1 AND 256 AND
    idempotency_key ~ '^[A-Za-z0-9._:-]+$'
  ),
  CONSTRAINT approval_requests_input_hash_chk
    CHECK (input_hash ~ '^[a-f0-9]{64}$')
);

ALTER TABLE approval_requests
DROP CONSTRAINT IF EXISTS approval_requests_trace_fk;

ALTER TABLE approval_requests
DROP CONSTRAINT IF EXISTS approval_requests_model_config_fk;

ALTER TABLE approval_requests
ADD CONSTRAINT approval_requests_trace_fk
FOREIGN KEY (tenant_id, trace_id)
REFERENCES agent_traces (tenant_id, trace_id)
ON DELETE CASCADE;

ALTER TABLE approval_requests
ADD CONSTRAINT approval_requests_model_config_fk
FOREIGN KEY (tenant_id, model_config_version_id)
REFERENCES tenant_model_configs (tenant_id, id)
ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION prevent_approval_snapshot_mutation()
RETURNS trigger AS $$
BEGIN
  IF (
    NEW.approval_id,
    NEW.tenant_id,
    NEW.trace_id,
    NEW.suggested_reply,
    NEW.evidence_refs,
    NEW.tool_result_refs,
    NEW.risk_reason,
    NEW.generated_action,
    NEW.agent_version_id,
    NEW.prompt_version_id,
    NEW.policy_version_id,
    NEW.tool_manifest_version_id,
    NEW.risk_rule_version_id,
    NEW.retrieval_config_version_id,
    NEW.model_config_version_id,
    NEW.expires_at,
    NEW.idempotency_key,
    NEW.input_hash,
    NEW.created_at
  ) IS DISTINCT FROM (
    OLD.approval_id,
    OLD.tenant_id,
    OLD.trace_id,
    OLD.suggested_reply,
    OLD.evidence_refs,
    OLD.tool_result_refs,
    OLD.risk_reason,
    OLD.generated_action,
    OLD.agent_version_id,
    OLD.prompt_version_id,
    OLD.policy_version_id,
    OLD.tool_manifest_version_id,
    OLD.risk_rule_version_id,
    OLD.retrieval_config_version_id,
    OLD.model_config_version_id,
    OLD.expires_at,
    OLD.idempotency_key,
    OLD.input_hash,
    OLD.created_at
  ) THEN
    RAISE EXCEPTION 'approval snapshot is immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS approval_requests_prevent_snapshot_mutation
ON approval_requests;

CREATE TRIGGER approval_requests_prevent_snapshot_mutation
BEFORE UPDATE ON approval_requests
FOR EACH ROW
EXECUTE FUNCTION prevent_approval_snapshot_mutation();

CREATE OR REPLACE FUNCTION create_pending_approval(
  input_approval_id uuid,
  input_tenant_id uuid,
  input_trace_id uuid,
  input_expected_state text,
  input_suggested_reply text,
  input_evidence_refs text[],
  input_tool_result_refs text[],
  input_risk_reason text,
  input_generated_action text,
  input_agent_version_id text,
  input_prompt_version_id text,
  input_policy_version_id text,
  input_tool_manifest_version_id text,
  input_risk_rule_version_id text,
  input_retrieval_config_version_id text,
  input_model_config_version_id uuid,
  input_expires_at timestamptz,
  input_idempotency_key text,
  input_hash text,
  input_created_at timestamptz DEFAULT now()
)
RETURNS approval_requests AS $$
DECLARE
  existing_approval approval_requests%ROWTYPE;
  trace_record agent_traces%ROWTYPE;
  inserted_approval approval_requests%ROWTYPE;
BEGIN
  SELECT *
  INTO trace_record
  FROM agent_traces
  WHERE tenant_id = input_tenant_id AND trace_id = input_trace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'approval trace not found'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT *
  INTO existing_approval
  FROM approval_requests
  WHERE
    tenant_id = input_tenant_id AND
    trace_id = input_trace_id AND
    idempotency_key = input_idempotency_key;

  IF FOUND THEN
    IF existing_approval.input_hash <> input_hash THEN
      RAISE EXCEPTION 'approval idempotency conflict'
        USING ERRCODE = 'unique_violation';
    END IF;
    RETURN existing_approval;
  END IF;

  SELECT *
  INTO existing_approval
  FROM approval_requests
  WHERE tenant_id = input_tenant_id AND trace_id = input_trace_id;

  IF FOUND THEN
    IF existing_approval.input_hash = input_hash THEN
      RETURN existing_approval;
    END IF;
    RAISE EXCEPTION 'trace already has an approval'
      USING ERRCODE = 'unique_violation';
  END IF;

  IF
    trace_record.agent_version_id <> input_agent_version_id OR
    trace_record.prompt_version_id <> input_prompt_version_id OR
    trace_record.policy_version_id <> input_policy_version_id OR
    trace_record.tool_manifest_version_id <> input_tool_manifest_version_id OR
    trace_record.risk_rule_version_id <> input_risk_rule_version_id OR
    trace_record.retrieval_config_version_id <>
      input_retrieval_config_version_id OR
    trace_record.model_config_version_id <> input_model_config_version_id
  THEN
    RAISE EXCEPTION 'approval version snapshot does not match trace'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM transition_ticket_execution(
    input_tenant_id,
    input_trace_id,
    input_expected_state,
    'waiting_approval',
    'approval_required',
    'system',
    NULL,
    'approval:' || input_idempotency_key,
    input_hash,
    input_created_at
  );

  INSERT INTO approval_requests (
    approval_id,
    tenant_id,
    trace_id,
    state,
    suggested_reply,
    evidence_refs,
    tool_result_refs,
    risk_reason,
    generated_action,
    agent_version_id,
    prompt_version_id,
    policy_version_id,
    tool_manifest_version_id,
    risk_rule_version_id,
    retrieval_config_version_id,
    model_config_version_id,
    expires_at,
    idempotency_key,
    input_hash,
    created_at
  )
  VALUES (
    input_approval_id,
    input_tenant_id,
    input_trace_id,
    'pending',
    input_suggested_reply,
    input_evidence_refs,
    input_tool_result_refs,
    input_risk_reason,
    input_generated_action,
    input_agent_version_id,
    input_prompt_version_id,
    input_policy_version_id,
    input_tool_manifest_version_id,
    input_risk_rule_version_id,
    input_retrieval_config_version_id,
    input_model_config_version_id,
    input_expires_at,
    input_idempotency_key,
    input_hash,
    input_created_at
  )
  RETURNING *
  INTO inserted_approval;

  RETURN inserted_approval;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE approval_requests IS
'One immutable approval snapshot per trace with guarded action fields.';

COMMENT ON FUNCTION create_pending_approval IS
'Atomically transitions a trace to waiting_approval and inserts its snapshot.';

COMMIT;

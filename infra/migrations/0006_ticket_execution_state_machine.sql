-- Phase 3A: guarded, idempotent, and auditable ticket execution transitions.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS agent_traces_tenant_trace_uniq
ON agent_traces (tenant_id, trace_id);

CREATE TABLE IF NOT EXISTS ticket_execution_transitions (
  transition_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  trace_id uuid NOT NULL,
  from_state text NOT NULL,
  to_state text NOT NULL,
  reason_code text NOT NULL,
  actor_type text NOT NULL,
  actor_id text,
  idempotency_key text NOT NULL,
  input_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticket_execution_transitions_trace_fk
    FOREIGN KEY (tenant_id, trace_id)
    REFERENCES agent_traces (tenant_id, trace_id)
    ON DELETE CASCADE,
  CONSTRAINT ticket_execution_transitions_idempotency_uniq
    UNIQUE (tenant_id, trace_id, idempotency_key),
  CONSTRAINT ticket_execution_transitions_state_chk
    CHECK (
      from_state IN (
        'received',
        'normalized',
        'planned',
        'waiting_tool',
        'waiting_approval',
        'replied',
        'private_noted',
        'handed_off',
        'failed'
      ) AND
      to_state IN (
        'received',
        'normalized',
        'planned',
        'waiting_tool',
        'waiting_approval',
        'replied',
        'private_noted',
        'handed_off',
        'failed'
      ) AND
      from_state <> to_state
    ),
  CONSTRAINT ticket_execution_transitions_reason_chk
    CHECK (
      reason_code IN (
        'pii_normalized',
        'plan_created',
        'tool_required',
        'tool_completed',
        'approval_required',
        'auto_reply_delivered',
        'approval_reply_delivered',
        'shadow_note_delivered',
        'approval_rejected',
        'human_handoff',
        'approval_escalated',
        'approval_expired',
        'pipeline_failed',
        'delivery_failed',
        'state_conflict'
      )
    ),
  CONSTRAINT ticket_execution_transitions_actor_chk
    CHECK (
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
  CONSTRAINT ticket_execution_transitions_idempotency_chk
    CHECK (
      idempotency_key = trim(idempotency_key) AND
      length(idempotency_key) BETWEEN 1 AND 256 AND
      idempotency_key ~ '^[A-Za-z0-9._:-]+$'
    ),
  CONSTRAINT ticket_execution_transitions_input_hash_chk
    CHECK (input_hash ~ '^[a-f0-9]{64}$')
);

ALTER TABLE ticket_execution_transitions
DROP CONSTRAINT IF EXISTS ticket_execution_transitions_trace_fk;

ALTER TABLE ticket_execution_transitions
ADD CONSTRAINT ticket_execution_transitions_trace_fk
FOREIGN KEY (tenant_id, trace_id)
REFERENCES agent_traces (tenant_id, trace_id)
ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS ticket_execution_transitions_trace_created_idx
ON ticket_execution_transitions (tenant_id, trace_id, created_at);

CREATE OR REPLACE FUNCTION is_ticket_execution_transition_allowed(
  input_from_state text,
  input_to_state text,
  input_reason_code text
)
RETURNS boolean AS $$
  SELECT CASE
    WHEN input_from_state = 'received' THEN
      (input_to_state, input_reason_code) IN (
        ('normalized', 'pii_normalized'),
        ('failed', 'pipeline_failed'),
        ('failed', 'state_conflict')
      )
    WHEN input_from_state = 'normalized' THEN
      (input_to_state, input_reason_code) IN (
        ('planned', 'plan_created'),
        ('failed', 'pipeline_failed'),
        ('failed', 'state_conflict')
      )
    WHEN input_from_state = 'planned' THEN
      (input_to_state, input_reason_code) IN (
        ('waiting_tool', 'tool_required'),
        ('waiting_approval', 'approval_required'),
        ('replied', 'auto_reply_delivered'),
        ('private_noted', 'shadow_note_delivered'),
        ('private_noted', 'approval_rejected'),
        ('handed_off', 'human_handoff'),
        ('handed_off', 'approval_escalated'),
        ('handed_off', 'approval_expired'),
        ('failed', 'pipeline_failed'),
        ('failed', 'delivery_failed'),
        ('failed', 'state_conflict')
      )
    WHEN input_from_state = 'waiting_tool' THEN
      (input_to_state, input_reason_code) IN (
        ('planned', 'tool_completed'),
        ('waiting_approval', 'approval_required'),
        ('replied', 'auto_reply_delivered'),
        ('private_noted', 'shadow_note_delivered'),
        ('handed_off', 'human_handoff'),
        ('failed', 'pipeline_failed'),
        ('failed', 'delivery_failed'),
        ('failed', 'state_conflict')
      )
    WHEN input_from_state = 'waiting_approval' THEN
      (input_to_state, input_reason_code) IN (
        ('replied', 'approval_reply_delivered'),
        ('private_noted', 'approval_rejected'),
        ('handed_off', 'human_handoff'),
        ('handed_off', 'approval_escalated'),
        ('handed_off', 'approval_expired'),
        ('failed', 'delivery_failed'),
        ('failed', 'state_conflict')
      )
    ELSE false
  END;
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;

ALTER TABLE ticket_execution_transitions
DROP CONSTRAINT IF EXISTS ticket_execution_transitions_rule_chk;

ALTER TABLE ticket_execution_transitions
ADD CONSTRAINT ticket_execution_transitions_rule_chk
CHECK (
  is_ticket_execution_transition_allowed(
    from_state,
    to_state,
    reason_code
  )
);

CREATE OR REPLACE FUNCTION prevent_ticket_execution_transition_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ticket execution transition records are append-only'
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ticket_execution_transitions_append_only
ON ticket_execution_transitions;

CREATE TRIGGER ticket_execution_transitions_append_only
BEFORE UPDATE OR DELETE ON ticket_execution_transitions
FOR EACH ROW
EXECUTE FUNCTION prevent_ticket_execution_transition_mutation();

CREATE OR REPLACE FUNCTION guard_agent_trace_execution_transition()
RETURNS trigger AS $$
DECLARE
  transition_id_setting text;
BEGIN
  IF NEW.execution_state IS NOT DISTINCT FROM OLD.execution_state THEN
    RETURN NEW;
  END IF;

  transition_id_setting :=
    nullif(current_setting('opensupport.transition_id', true), '');

  IF transition_id_setting IS NULL OR NOT EXISTS (
    SELECT 1
    FROM ticket_execution_transitions AS transition
    WHERE
      transition.transition_id = transition_id_setting::uuid AND
      transition.tenant_id = OLD.tenant_id AND
      transition.trace_id = OLD.trace_id AND
      transition.from_state = OLD.execution_state AND
      transition.to_state = NEW.execution_state AND
      is_ticket_execution_transition_allowed(
        transition.from_state,
        transition.to_state,
        transition.reason_code
      )
  ) THEN
    RAISE EXCEPTION
      'agent trace execution state must use transition_ticket_execution'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agent_traces_guard_execution_transition
ON agent_traces;

CREATE TRIGGER agent_traces_guard_execution_transition
BEFORE UPDATE OF execution_state ON agent_traces
FOR EACH ROW
EXECUTE FUNCTION guard_agent_trace_execution_transition();

CREATE OR REPLACE FUNCTION transition_ticket_execution(
  input_tenant_id uuid,
  input_trace_id uuid,
  input_expected_state text,
  input_next_state text,
  input_reason_code text,
  input_actor_type text,
  input_actor_id text,
  input_idempotency_key text,
  input_hash text,
  input_created_at timestamptz DEFAULT now()
)
RETURNS ticket_execution_transitions AS $$
DECLARE
  existing_transition ticket_execution_transitions%ROWTYPE;
  current_state text;
  inserted_transition ticket_execution_transitions%ROWTYPE;
BEGIN
  SELECT execution_state
  INTO current_state
  FROM agent_traces
  WHERE
    tenant_id = input_tenant_id AND
    trace_id = input_trace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket execution trace not found'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT *
  INTO existing_transition
  FROM ticket_execution_transitions
  WHERE
    tenant_id = input_tenant_id AND
    trace_id = input_trace_id AND
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
      RAISE EXCEPTION 'ticket execution idempotency conflict'
        USING ERRCODE = 'unique_violation';
    END IF;
    RETURN existing_transition;
  END IF;

  IF current_state <> input_expected_state THEN
    RAISE EXCEPTION
      'ticket execution stale state: expected %, found %',
      input_expected_state,
      current_state
      USING ERRCODE = 'serialization_failure';
  END IF;

  IF NOT is_ticket_execution_transition_allowed(
    input_expected_state,
    input_next_state,
    input_reason_code
  ) THEN
    RAISE EXCEPTION
      'invalid ticket execution transition: % -> % (%)',
      input_expected_state,
      input_next_state,
      input_reason_code
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO ticket_execution_transitions (
    tenant_id,
    trace_id,
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
    input_tenant_id,
    input_trace_id,
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
    'opensupport.transition_id',
    inserted_transition.transition_id::text,
    true
  );

  UPDATE agent_traces
  SET execution_state = input_next_state
  WHERE
    tenant_id = input_tenant_id AND
    trace_id = input_trace_id AND
    execution_state = input_expected_state;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket execution state changed concurrently'
      USING ERRCODE = 'serialization_failure';
  END IF;

  PERFORM set_config('opensupport.transition_id', '', true);
  RETURN inserted_transition;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE ticket_execution_transitions IS
'Append-only ticket execution state changes with actor, reason, idempotency, and input hash.';

COMMENT ON COLUMN agent_traces.execution_state IS
'TicketExecution state; updates must use transition_ticket_execution for guarded append-only audit.';

COMMENT ON FUNCTION transition_ticket_execution(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) IS
'Atomic compare-and-set state transition plus append-only audit insertion.';

COMMIT;

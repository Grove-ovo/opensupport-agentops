-- Phase 3E: terminal approval actions, edit distance, and actor audit.

BEGIN;

ALTER TABLE approval_requests
ADD COLUMN IF NOT EXISTS action_id uuid;

CREATE OR REPLACE FUNCTION normalized_approval_edit_distance(
  original_text text,
  edited_text text
)
RETURNS numeric AS $$
DECLARE
  source_length integer := char_length(original_text);
  target_length integer := char_length(edited_text);
  previous_row integer[];
  current_row integer[];
  row_index integer;
  column_index integer;
  substitution_cost integer;
BEGIN
  IF source_length = 0 AND target_length = 0 THEN
    RETURN 0;
  END IF;

  previous_row := array_fill(0, ARRAY[target_length + 1]);
  FOR column_index IN 0..target_length LOOP
    previous_row[column_index + 1] := column_index;
  END LOOP;

  FOR row_index IN 1..source_length LOOP
    current_row := array_fill(0, ARRAY[target_length + 1]);
    current_row[1] := row_index;
    FOR column_index IN 1..target_length LOOP
      substitution_cost := CASE
        WHEN substr(original_text, row_index, 1) =
          substr(edited_text, column_index, 1)
        THEN 0
        ELSE 1
      END;
      current_row[column_index + 1] := least(
        previous_row[column_index + 1] + 1,
        current_row[column_index] + 1,
        previous_row[column_index] + substitution_cost
      );
    END LOOP;
    previous_row := current_row;
  END LOOP;

  RETURN round(
    previous_row[target_length + 1]::numeric /
      greatest(source_length, target_length),
    6
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE;

CREATE UNIQUE INDEX IF NOT EXISTS approval_requests_scope_id_uniq
ON approval_requests (tenant_id, trace_id, approval_id);

CREATE TABLE IF NOT EXISTS approval_action_records (
  action_id uuid PRIMARY KEY,
  approval_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  trace_id uuid NOT NULL,
  action text NOT NULL,
  resulting_state text NOT NULL,
  actor_type text NOT NULL,
  actor_id text,
  edited_reply text,
  edit_distance numeric(8, 6),
  delivery_receipt_id text,
  provider_message_id text,
  delivery_status text,
  idempotency_key text NOT NULL,
  input_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT approval_action_records_approval_scope_fk
    FOREIGN KEY (tenant_id, trace_id)
    REFERENCES agent_traces (tenant_id, trace_id)
    ON DELETE CASCADE,
  CONSTRAINT approval_action_records_idempotency_uniq
    UNIQUE (tenant_id, approval_id, idempotency_key),
  CONSTRAINT approval_action_records_action_chk CHECK (
    (action = 'approve' AND resulting_state = 'approved') OR
    (action = 'edit' AND resulting_state = 'edited') OR
    (action = 'reject' AND resulting_state = 'rejected') OR
    (action = 'escalate' AND resulting_state = 'escalated') OR
    (action = 'expire' AND resulting_state = 'expired')
  ),
  CONSTRAINT approval_action_records_actor_chk CHECK (
    (action = 'expire' AND actor_type = 'scheduler' AND actor_id IS NULL) OR
    (
      action <> 'expire' AND actor_type = 'operator' AND
      actor_id IS NOT NULL AND actor_id = trim(actor_id) AND
      length(actor_id) BETWEEN 1 AND 256
    )
  ),
  CONSTRAINT approval_action_records_delivery_chk CHECK (
    (
      action IN ('approve', 'edit') AND
      delivery_receipt_id IS NOT NULL AND
      provider_message_id IS NOT NULL AND
      delivery_status IN ('succeeded', 'duplicate')
    ) OR
    (
      action NOT IN ('approve', 'edit') AND
      delivery_receipt_id IS NULL AND
      provider_message_id IS NULL AND
      delivery_status IS NULL
    )
  ),
  CONSTRAINT approval_action_records_edit_chk CHECK (
    (
      action = 'edit' AND edited_reply IS NOT NULL AND
      edited_reply = trim(edited_reply) AND
      length(edited_reply) BETWEEN 1 AND 20000 AND
      edit_distance BETWEEN 0 AND 1
    ) OR
    (
      action <> 'edit' AND edited_reply IS NULL AND edit_distance IS NULL
    )
  ),
  CONSTRAINT approval_action_records_idempotency_chk CHECK (
    idempotency_key = trim(idempotency_key) AND
    length(idempotency_key) BETWEEN 1 AND 256 AND
    idempotency_key ~ '^[A-Za-z0-9._:-]+$'
  ),
  CONSTRAINT approval_action_records_input_hash_chk
    CHECK (input_hash ~ '^[a-f0-9]{64}$')
);

ALTER TABLE approval_action_records
DROP CONSTRAINT IF EXISTS approval_action_records_approval_scope_fk;

ALTER TABLE approval_action_records
DROP CONSTRAINT IF EXISTS approval_action_records_approval_id_fkey;

ALTER TABLE approval_action_records
ADD CONSTRAINT approval_action_records_approval_scope_fk
FOREIGN KEY (tenant_id, trace_id, approval_id)
REFERENCES approval_requests (tenant_id, trace_id, approval_id)
ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS approval_action_records_one_per_approval_idx
ON approval_action_records (approval_id);

ALTER TABLE approval_requests
DROP CONSTRAINT IF EXISTS approval_requests_action_chk;

ALTER TABLE approval_requests
ADD CONSTRAINT approval_requests_action_chk CHECK (
  (
    state = 'pending' AND action_id IS NULL AND approver_action IS NULL AND
    approver_id IS NULL AND edited_reply IS NULL AND edit_distance IS NULL AND
    action_at IS NULL
  ) OR
  (
    state IN ('approved', 'rejected', 'escalated') AND
    action_id IS NOT NULL AND approver_action IS NOT NULL AND
    approver_id IS NOT NULL AND edited_reply IS NULL AND
    edit_distance IS NULL AND action_at IS NOT NULL
  ) OR
  (
    state = 'edited' AND action_id IS NOT NULL AND
    approver_action = 'edit' AND approver_id IS NOT NULL AND
    edited_reply IS NOT NULL AND edit_distance BETWEEN 0 AND 1 AND
    action_at IS NOT NULL
  ) OR
  (
    state = 'expired' AND action_id IS NOT NULL AND
    approver_action = 'expire' AND approver_id IS NULL AND
    edited_reply IS NULL AND edit_distance IS NULL AND action_at IS NOT NULL
  )
);

CREATE OR REPLACE FUNCTION prevent_approval_action_record_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'approval action records are append-only'
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS approval_action_records_append_only
ON approval_action_records;

CREATE TRIGGER approval_action_records_append_only
BEFORE UPDATE OR DELETE ON approval_action_records
FOR EACH ROW
EXECUTE FUNCTION prevent_approval_action_record_mutation();

CREATE OR REPLACE FUNCTION guard_approval_action_transition()
RETURNS trigger AS $$
DECLARE
  action_id_setting text;
BEGIN
  IF (
    NEW.state,
    NEW.action_id,
    NEW.approver_action,
    NEW.approver_id,
    NEW.edited_reply,
    NEW.edit_distance,
    NEW.action_at
  ) IS NOT DISTINCT FROM (
    OLD.state,
    OLD.action_id,
    OLD.approver_action,
    OLD.approver_id,
    OLD.edited_reply,
    OLD.edit_distance,
    OLD.action_at
  ) THEN
    RETURN NEW;
  END IF;

  action_id_setting :=
    nullif(current_setting('opensupport.approval_action_id', true), '');

  IF action_id_setting IS NULL OR NOT EXISTS (
    SELECT 1
    FROM approval_action_records AS action_record
    WHERE
      action_record.action_id = action_id_setting::uuid AND
      action_record.approval_id = OLD.approval_id AND
      action_record.tenant_id = OLD.tenant_id AND
      action_record.trace_id = OLD.trace_id AND
      action_record.resulting_state = NEW.state
  ) THEN
    RAISE EXCEPTION 'approval action must use apply_approval_action'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS approval_requests_guard_action_transition
ON approval_requests;

CREATE TRIGGER approval_requests_guard_action_transition
BEFORE UPDATE OF state, action_id, approver_action, approver_id,
  edited_reply, edit_distance, action_at
ON approval_requests
FOR EACH ROW
EXECUTE FUNCTION guard_approval_action_transition();

CREATE OR REPLACE FUNCTION apply_approval_action(
  input_action_id uuid,
  input_approval_id uuid,
  input_tenant_id uuid,
  input_trace_id uuid,
  input_expected_state text,
  input_action text,
  input_actor_type text,
  input_actor_id text,
  input_edited_reply text,
  input_delivery_receipt_id text,
  input_provider_message_id text,
  input_delivery_status text,
  input_idempotency_key text,
  input_hash text,
  input_created_at timestamptz DEFAULT now()
)
RETURNS approval_action_records AS $$
DECLARE
  approval_record approval_requests%ROWTYPE;
  existing_action approval_action_records%ROWTYPE;
  inserted_action approval_action_records%ROWTYPE;
  target_state text;
  target_ticket_state text;
  target_reason text;
  calculated_edit_distance numeric(8, 6);
BEGIN
  SELECT *
  INTO approval_record
  FROM approval_requests
  WHERE
    approval_id = input_approval_id AND
    tenant_id = input_tenant_id AND
    trace_id = input_trace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'approval not found'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT *
  INTO existing_action
  FROM approval_action_records
  WHERE
    tenant_id = input_tenant_id AND
    approval_id = input_approval_id AND
    idempotency_key = input_idempotency_key;

  IF FOUND THEN
    IF existing_action.input_hash <> input_hash THEN
      RAISE EXCEPTION 'approval action idempotency conflict'
        USING ERRCODE = 'unique_violation';
    END IF;
    RETURN existing_action;
  END IF;

  IF approval_record.state <> input_expected_state OR
    approval_record.state <> 'pending'
  THEN
    RAISE EXCEPTION 'approval is no longer pending'
      USING ERRCODE = 'serialization_failure';
  END IF;

  IF input_action <> 'expire' AND input_created_at >= approval_record.expires_at
  THEN
    RAISE EXCEPTION 'approval action arrived after expiry'
      USING ERRCODE = 'serialization_failure';
  END IF;

  IF input_action = 'expire' AND input_created_at < approval_record.expires_at
  THEN
    RAISE EXCEPTION 'approval cannot expire before expires_at'
      USING ERRCODE = 'check_violation';
  END IF;

  CASE input_action
    WHEN 'approve' THEN
      target_state := 'approved';
      target_ticket_state := 'replied';
      target_reason := 'approval_reply_delivered';
    WHEN 'edit' THEN
      target_state := 'edited';
      target_ticket_state := 'replied';
      target_reason := 'approval_reply_delivered';
      calculated_edit_distance := normalized_approval_edit_distance(
        approval_record.suggested_reply,
        input_edited_reply
      );
    WHEN 'reject' THEN
      target_state := 'rejected';
      target_ticket_state := 'private_noted';
      target_reason := 'approval_rejected';
    WHEN 'escalate' THEN
      target_state := 'escalated';
      target_ticket_state := 'handed_off';
      target_reason := 'approval_escalated';
    WHEN 'expire' THEN
      target_state := 'expired';
      target_ticket_state := 'handed_off';
      target_reason := 'approval_expired';
    ELSE
      RAISE EXCEPTION 'unsupported approval action'
        USING ERRCODE = 'check_violation';
  END CASE;

  INSERT INTO approval_action_records (
    action_id,
    approval_id,
    tenant_id,
    trace_id,
    action,
    resulting_state,
    actor_type,
    actor_id,
    edited_reply,
    edit_distance,
    delivery_receipt_id,
    provider_message_id,
    delivery_status,
    idempotency_key,
    input_hash,
    created_at
  )
  VALUES (
    input_action_id,
    input_approval_id,
    input_tenant_id,
    input_trace_id,
    input_action,
    target_state,
    input_actor_type,
    input_actor_id,
    input_edited_reply,
    calculated_edit_distance,
    input_delivery_receipt_id,
    input_provider_message_id,
    input_delivery_status,
    input_idempotency_key,
    input_hash,
    input_created_at
  )
  RETURNING *
  INTO inserted_action;

  PERFORM transition_ticket_execution(
    input_tenant_id,
    input_trace_id,
    'waiting_approval',
    target_ticket_state,
    target_reason,
    input_actor_type,
    input_actor_id,
    'approval-action:' || input_idempotency_key,
    input_hash,
    input_created_at
  );

  PERFORM set_config(
    'opensupport.approval_action_id',
    inserted_action.action_id::text,
    true
  );

  UPDATE approval_requests
  SET
    state = target_state,
    action_id = inserted_action.action_id,
    approver_action = input_action,
    approver_id = input_actor_id,
    edited_reply = input_edited_reply,
    edit_distance = calculated_edit_distance,
    action_at = input_created_at
  WHERE approval_id = input_approval_id AND state = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'approval state changed concurrently'
      USING ERRCODE = 'serialization_failure';
  END IF;

  PERFORM set_config('opensupport.approval_action_id', '', true);
  RETURN inserted_action;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE approval_action_records IS
'Append-only terminal approval actions with actor, edit, and delivery audit.';

COMMENT ON FUNCTION apply_approval_action IS
'Compare-and-set pending approval action and matching ticket transition.';

COMMIT;

-- Phase 1E: PII audit metadata and immutable trace version snapshots.

BEGIN;

DROP TRIGGER IF EXISTS agent_traces_prevent_snapshot_mutation
ON agent_traces;

ALTER TABLE agent_traces
ADD COLUMN IF NOT EXISTS execution_state text;

ALTER TABLE agent_traces
ADD COLUMN IF NOT EXISTS pii_categories text[];

ALTER TABLE agent_traces
ADD COLUMN IF NOT EXISTS pii_replacement_map_ref text;

ALTER TABLE agent_traces
ADD COLUMN IF NOT EXISTS masked_input_hash text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM agent_traces
    WHERE
      ticket_id IS NULL OR length(trim(ticket_id)) = 0 OR
      conversation_id IS NULL OR length(trim(conversation_id)) = 0 OR
      message_id IS NULL OR length(trim(message_id)) = 0 OR
      agent_version_id IS NULL OR length(trim(agent_version_id)) = 0 OR
      prompt_version_id IS NULL OR length(trim(prompt_version_id)) = 0 OR
      policy_version_id IS NULL OR length(trim(policy_version_id)) = 0 OR
      tool_manifest_version_id IS NULL OR length(trim(tool_manifest_version_id)) = 0 OR
      risk_rule_version_id IS NULL OR length(trim(risk_rule_version_id)) = 0 OR
      retrieval_config_version_id IS NULL OR
        length(trim(retrieval_config_version_id)) = 0 OR
      model_config_version_id IS NULL OR
        length(trim(model_config_version_id::text)) = 0 OR
      execution_state IS NULL OR
      pii_categories IS NULL OR
      masked_input_hash IS NULL
  ) THEN
    RAISE EXCEPTION
      'existing agent traces require version, execution, and PII audit backfill before Phase 1E'
      USING ERRCODE = 'not_null_violation';
  END IF;
END;
$$;

DO $$
DECLARE
  current_type text;
BEGIN
  SELECT data_type
  INTO current_type
  FROM information_schema.columns
  WHERE
    table_schema = 'public' AND
    table_name = 'agent_traces' AND
    column_name = 'model_config_version_id';

  IF current_type <> 'uuid' THEN
    ALTER TABLE agent_traces
    ALTER COLUMN model_config_version_id TYPE uuid
    USING model_config_version_id::uuid;
  END IF;
END;
$$;

ALTER TABLE agent_traces
ALTER COLUMN ticket_id SET NOT NULL;

ALTER TABLE agent_traces
ALTER COLUMN conversation_id SET NOT NULL;

ALTER TABLE agent_traces
ALTER COLUMN message_id SET NOT NULL;

ALTER TABLE agent_traces
ALTER COLUMN runtime_mode DROP DEFAULT;

ALTER TABLE agent_traces
ALTER COLUMN agent_version_id SET NOT NULL;

ALTER TABLE agent_traces
ALTER COLUMN prompt_version_id SET NOT NULL;

ALTER TABLE agent_traces
ALTER COLUMN policy_version_id SET NOT NULL;

ALTER TABLE agent_traces
ALTER COLUMN tool_manifest_version_id SET NOT NULL;

ALTER TABLE agent_traces
ALTER COLUMN risk_rule_version_id SET NOT NULL;

ALTER TABLE agent_traces
ALTER COLUMN retrieval_config_version_id SET NOT NULL;

ALTER TABLE agent_traces
ALTER COLUMN model_config_version_id SET NOT NULL;

ALTER TABLE agent_traces
ALTER COLUMN execution_state SET NOT NULL;

ALTER TABLE agent_traces
ALTER COLUMN pii_categories SET NOT NULL;

ALTER TABLE agent_traces
ALTER COLUMN masked_input_hash SET NOT NULL;

ALTER TABLE agent_traces
DROP CONSTRAINT IF EXISTS agent_traces_tenant_model_config_fk;

ALTER TABLE agent_traces
ADD CONSTRAINT agent_traces_tenant_model_config_fk
FOREIGN KEY (tenant_id, model_config_version_id)
REFERENCES tenant_model_configs (tenant_id, id)
ON DELETE RESTRICT;

ALTER TABLE agent_traces
DROP CONSTRAINT IF EXISTS agent_traces_context_canonical_chk;

ALTER TABLE agent_traces
ADD CONSTRAINT agent_traces_context_canonical_chk
CHECK (
  ticket_id = trim(ticket_id) AND length(ticket_id) BETWEEN 1 AND 256 AND
  conversation_id = trim(conversation_id) AND
    length(conversation_id) BETWEEN 1 AND 256 AND
  message_id = trim(message_id) AND length(message_id) BETWEEN 1 AND 256
);

ALTER TABLE agent_traces
DROP CONSTRAINT IF EXISTS agent_traces_runtime_mode_chk;

ALTER TABLE agent_traces
ADD CONSTRAINT agent_traces_runtime_mode_chk
CHECK (runtime_mode IN ('shadow', 'assist', 'auto'));

ALTER TABLE agent_traces
DROP CONSTRAINT IF EXISTS agent_traces_execution_state_chk;

ALTER TABLE agent_traces
ADD CONSTRAINT agent_traces_execution_state_chk
CHECK (
  execution_state IN (
    'received',
    'normalized',
    'planned',
    'waiting_tool',
    'waiting_approval',
    'replied',
    'private_noted',
    'handed_off',
    'failed'
  )
);

ALTER TABLE agent_traces
DROP CONSTRAINT IF EXISTS agent_traces_version_snapshot_chk;

ALTER TABLE agent_traces
ADD CONSTRAINT agent_traces_version_snapshot_chk
CHECK (
  agent_version_id = trim(agent_version_id) AND
    length(agent_version_id) BETWEEN 1 AND 256 AND
  prompt_version_id = trim(prompt_version_id) AND
    length(prompt_version_id) BETWEEN 1 AND 256 AND
  policy_version_id = trim(policy_version_id) AND
    length(policy_version_id) BETWEEN 1 AND 256 AND
  tool_manifest_version_id = trim(tool_manifest_version_id) AND
    length(tool_manifest_version_id) BETWEEN 1 AND 256 AND
  risk_rule_version_id = trim(risk_rule_version_id) AND
    length(risk_rule_version_id) BETWEEN 1 AND 256 AND
  retrieval_config_version_id = trim(retrieval_config_version_id) AND
    length(retrieval_config_version_id) BETWEEN 1 AND 256
);

CREATE OR REPLACE FUNCTION text_array_values_unique(input_values text[])
RETURNS boolean AS $$
  SELECT count(*) = count(DISTINCT value)
  FROM unnest(input_values) AS value;
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;

ALTER TABLE agent_traces
DROP CONSTRAINT IF EXISTS agent_traces_pii_categories_chk;

ALTER TABLE agent_traces
ADD CONSTRAINT agent_traces_pii_categories_chk
CHECK (
  pii_categories <@ ARRAY[
    'email',
    'phone',
    'address',
    'id_number',
    'bank_card'
  ]::text[] AND
  text_array_values_unique(pii_categories)
);

ALTER TABLE agent_traces
DROP CONSTRAINT IF EXISTS agent_traces_pii_reference_chk;

ALTER TABLE agent_traces
ADD CONSTRAINT agent_traces_pii_reference_chk
CHECK (
  (
    cardinality(pii_categories) = 0 AND
    pii_replacement_map_ref IS NULL
  ) OR
  (
    cardinality(pii_categories) > 0 AND
    pii_replacement_map_ref ~ '^pii-map:[A-Za-z0-9._-]{1,128}$'
  )
);

ALTER TABLE agent_traces
DROP CONSTRAINT IF EXISTS agent_traces_masked_input_hash_chk;

ALTER TABLE agent_traces
ADD CONSTRAINT agent_traces_masked_input_hash_chk
CHECK (masked_input_hash ~ '^[a-f0-9]{64}$');

ALTER TABLE agent_traces
DROP CONSTRAINT IF EXISTS agent_traces_entities_object_chk;

ALTER TABLE agent_traces
ADD CONSTRAINT agent_traces_entities_object_chk
CHECK (jsonb_typeof(entities) = 'object');

ALTER TABLE agent_traces
DROP CONSTRAINT IF EXISTS agent_traces_retrieved_docs_array_chk;

ALTER TABLE agent_traces
ADD CONSTRAINT agent_traces_retrieved_docs_array_chk
CHECK (jsonb_typeof(retrieved_doc_ids) = 'array');

ALTER TABLE agent_traces
DROP CONSTRAINT IF EXISTS agent_traces_tool_calls_array_chk;

ALTER TABLE agent_traces
ADD CONSTRAINT agent_traces_tool_calls_array_chk
CHECK (jsonb_typeof(tool_call_ids) = 'array');

ALTER TABLE agent_traces
DROP CONSTRAINT IF EXISTS agent_traces_metadata_object_chk;

ALTER TABLE agent_traces
ADD CONSTRAINT agent_traces_metadata_object_chk
CHECK (jsonb_typeof(metadata) = 'object');

CREATE OR REPLACE FUNCTION prevent_agent_trace_snapshot_mutation()
RETURNS trigger AS $$
BEGIN
  IF (
    NEW.trace_id,
    NEW.tenant_id,
    NEW.ticket_id,
    NEW.conversation_id,
    NEW.message_id,
    NEW.runtime_mode,
    NEW.agent_version_id,
    NEW.prompt_version_id,
    NEW.policy_version_id,
    NEW.tool_manifest_version_id,
    NEW.risk_rule_version_id,
    NEW.retrieval_config_version_id,
    NEW.model_config_version_id,
    NEW.pii_categories,
    NEW.pii_replacement_map_ref,
    NEW.masked_input_hash,
    NEW.created_at
  ) IS DISTINCT FROM (
    OLD.trace_id,
    OLD.tenant_id,
    OLD.ticket_id,
    OLD.conversation_id,
    OLD.message_id,
    OLD.runtime_mode,
    OLD.agent_version_id,
    OLD.prompt_version_id,
    OLD.policy_version_id,
    OLD.tool_manifest_version_id,
    OLD.risk_rule_version_id,
    OLD.retrieval_config_version_id,
    OLD.model_config_version_id,
    OLD.pii_categories,
    OLD.pii_replacement_map_ref,
    OLD.masked_input_hash,
    OLD.created_at
  ) THEN
    RAISE EXCEPTION 'agent trace identity and snapshots are immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agent_traces_prevent_snapshot_mutation
BEFORE UPDATE ON agent_traces
FOR EACH ROW
EXECUTE FUNCTION prevent_agent_trace_snapshot_mutation();

CREATE INDEX IF NOT EXISTS agent_traces_tenant_execution_state_idx
ON agent_traces (tenant_id, execution_state, created_at DESC);

COMMENT ON COLUMN agent_traces.execution_state IS
'TicketExecution state seed; transition guards are implemented in a later phase.';

COMMENT ON COLUMN agent_traces.pii_categories IS
'Unique PII categories detected before provider-bound processing.';

COMMENT ON COLUMN agent_traces.pii_replacement_map_ref IS
'Opaque reference for a future encrypted replacement map; never stores raw PII.';

COMMENT ON COLUMN agent_traces.masked_input_hash IS
'SHA-256 hash of provider-bound masked input; raw customer text is not stored.';

COMMIT;

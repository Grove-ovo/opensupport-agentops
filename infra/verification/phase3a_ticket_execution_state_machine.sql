\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  tenant_id_value uuid := gen_random_uuid();
  model_config_id uuid := gen_random_uuid();
  trace_id_value uuid := gen_random_uuid();
  first_transition ticket_execution_transitions%ROWTYPE;
  duplicate_transition ticket_execution_transitions%ROWTYPE;
BEGIN
  INSERT INTO tenants (id, slug, display_name)
  VALUES (
    tenant_id_value,
    'phase3a-state-machine',
    'Phase 3A State Machine'
  );

  INSERT INTO tenant_model_configs (
    id,
    tenant_id,
    version,
    provider,
    fast_model,
    strong_model,
    embedding_model,
    fallback_model,
    timeout_ms,
    max_cost_per_ticket,
    daily_budget,
    budget_currency,
    encrypted_api_key_ref,
    is_active,
    config_fingerprint
  )
  VALUES (
    model_config_id,
    tenant_id_value,
    1,
    'mock',
    'fast-model',
    'strong-model',
    'embedding-model',
    'fallback-model',
    10000,
    1,
    10,
    'USD',
    'enc:v1:local-dev-v1:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA:ZmFrZQ',
    true,
    repeat('a', 64)
  );

  INSERT INTO agent_traces (
    trace_id,
    tenant_id,
    ticket_id,
    conversation_id,
    message_id,
    runtime_mode,
    execution_state,
    agent_version_id,
    prompt_version_id,
    policy_version_id,
    tool_manifest_version_id,
    risk_rule_version_id,
    retrieval_config_version_id,
    model_config_version_id,
    pii_categories,
    masked_input_hash
  )
  VALUES (
    trace_id_value,
    tenant_id_value,
    'ticket-phase3a',
    'conversation-phase3a',
    'message-phase3a',
    'shadow',
    'received',
    'agent-v1',
    'prompt-v1',
    'policy-v1',
    'tools-v1',
    'risk-v1',
    'retrieval-v1',
    model_config_id,
    ARRAY[]::text[],
    repeat('b', 64)
  );

  BEGIN
    UPDATE agent_traces
    SET execution_state = 'normalized'
    WHERE trace_id = trace_id_value;

    RAISE EXCEPTION 'direct execution state update was not rejected';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  SELECT *
  INTO first_transition
  FROM transition_ticket_execution(
    tenant_id_value,
    trace_id_value,
    'received',
    'normalized',
    'pii_normalized',
    'system',
    NULL,
    'phase3a-normalize',
    repeat('c', 64),
    '2026-06-19T00:00:00Z'
  );

  IF (
    SELECT execution_state
    FROM agent_traces
    WHERE trace_id = trace_id_value
  ) <> 'normalized' THEN
    RAISE EXCEPTION 'valid transition did not update the trace';
  END IF;

  IF (
    SELECT count(*)
    FROM ticket_execution_transitions
    WHERE trace_id = trace_id_value
  ) <> 1 THEN
    RAISE EXCEPTION 'valid transition did not create exactly one audit row';
  END IF;

  SELECT *
  INTO duplicate_transition
  FROM transition_ticket_execution(
    tenant_id_value,
    trace_id_value,
    'received',
    'normalized',
    'pii_normalized',
    'system',
    NULL,
    'phase3a-normalize',
    repeat('c', 64),
    '2026-06-19T01:00:00Z'
  );

  IF duplicate_transition.transition_id <> first_transition.transition_id THEN
    RAISE EXCEPTION 'idempotent retry did not return the original transition';
  END IF;

  BEGIN
    PERFORM transition_ticket_execution(
      tenant_id_value,
      trace_id_value,
      'normalized',
      'planned',
      'plan_created',
      'system',
      NULL,
      'phase3a-normalize',
      repeat('d', 64)
    );

    RAISE EXCEPTION 'idempotency conflict was not rejected';
  EXCEPTION
    WHEN unique_violation THEN NULL;
  END;

  BEGIN
    PERFORM transition_ticket_execution(
      tenant_id_value,
      trace_id_value,
      'received',
      'failed',
      'pipeline_failed',
      'system',
      NULL,
      'phase3a-stale',
      repeat('e', 64)
    );

    RAISE EXCEPTION 'stale expected state was not rejected';
  EXCEPTION
    WHEN serialization_failure THEN NULL;
  END;

  BEGIN
    PERFORM transition_ticket_execution(
      tenant_id_value,
      trace_id_value,
      'normalized',
      'replied',
      'auto_reply_delivered',
      'system',
      NULL,
      'phase3a-invalid-edge',
      repeat('f', 64)
    );

    RAISE EXCEPTION 'invalid transition edge was not rejected';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE ticket_execution_transitions
    SET reason_code = 'pipeline_failed'
    WHERE transition_id = first_transition.transition_id;

    RAISE EXCEPTION 'transition audit mutation was not rejected';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  IF (
    SELECT runtime_mode
    FROM agent_traces
    WHERE trace_id = trace_id_value
  ) <> 'shadow' THEN
    RAISE EXCEPTION 'runtime mode snapshot changed during transition';
  END IF;
END;
$$;

ROLLBACK;

\echo 'Phase 3A live ticket execution verification passed'

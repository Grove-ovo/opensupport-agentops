\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  first_tenant_id uuid := gen_random_uuid();
  second_tenant_id uuid := gen_random_uuid();
  first_config_id uuid := gen_random_uuid();
  second_config_id uuid := gen_random_uuid();
  test_trace_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO tenants (id, slug, display_name)
  VALUES
    (first_tenant_id, 'phase1e-first', 'Phase 1E First Tenant'),
    (second_tenant_id, 'phase1e-second', 'Phase 1E Second Tenant');

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
  VALUES
    (
      first_config_id,
      first_tenant_id,
      1,
      'openai',
      'gpt-4.1-mini',
      'gpt-4.1',
      'text-embedding-3-small',
      'gpt-4.1-mini',
      10000,
      0.02,
      5.0,
      'USD',
      'enc:v1:local-dev-v1:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA:ZmFrZQ',
      true,
      repeat('a', 64)
    ),
    (
      second_config_id,
      second_tenant_id,
      1,
      'openai',
      'gpt-4.1-mini',
      'gpt-4.1',
      'text-embedding-3-small',
      'gpt-4.1-mini',
      10000,
      0.02,
      5.0,
      'USD',
      'enc:v1:local-dev-v1:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA:ZmFrZTI',
      true,
      repeat('b', 64)
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
    pii_replacement_map_ref,
    masked_input_hash
  )
  VALUES (
    test_trace_id,
    first_tenant_id,
    'ticket-42',
    'conversation-42',
    'message-42',
    'shadow',
    'received',
    'agent-v1',
    'prompt-v1',
    'policy-v1',
    'tools-v1',
    'risk-v1',
    'retrieval-v1',
    first_config_id,
    ARRAY['email', 'phone'],
    'pii-map:phase1e-test-map',
    repeat('a', 64)
  );

  UPDATE agent_traces
  SET
    execution_state = 'normalized',
    intent = 'order_status'
  WHERE agent_traces.trace_id = test_trace_id;

  IF (
    SELECT execution_state
    FROM agent_traces
    WHERE agent_traces.trace_id = test_trace_id
  ) <> 'normalized' THEN
    RAISE EXCEPTION 'operational trace update did not succeed';
  END IF;

  BEGIN
    UPDATE agent_traces
    SET prompt_version_id = 'prompt-v2'
    WHERE agent_traces.trace_id = test_trace_id;

    RAISE EXCEPTION 'immutable trace snapshot update was not rejected';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO agent_traces (
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
      first_tenant_id,
      'ticket-cross-tenant',
      'conversation-cross-tenant',
      'message-cross-tenant',
      'shadow',
      'received',
      'agent-v1',
      'prompt-v1',
      'policy-v1',
      'tools-v1',
      'risk-v1',
      'retrieval-v1',
      second_config_id,
      ARRAY[]::text[],
      repeat('b', 64)
    );

    RAISE EXCEPTION 'cross-tenant model config reference was not rejected';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO agent_traces (
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
      pii_replacement_map_ref,
      masked_input_hash
    )
    VALUES (
      first_tenant_id,
      'ticket-invalid-pii',
      'conversation-invalid-pii',
      'message-invalid-pii',
      'shadow',
      'received',
      'agent-v1',
      'prompt-v1',
      'policy-v1',
      'tools-v1',
      'risk-v1',
      'retrieval-v1',
      first_config_id,
      ARRAY['email', 'email'],
      'pii-map:duplicate-category',
      repeat('c', 64)
    );

    RAISE EXCEPTION 'duplicate PII categories were not rejected';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO agent_traces (
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
      entities,
      pii_categories,
      masked_input_hash
    )
    VALUES (
      first_tenant_id,
      'ticket-invalid-json',
      'conversation-invalid-json',
      'message-invalid-json',
      'shadow',
      'received',
      'agent-v1',
      'prompt-v1',
      'policy-v1',
      'tools-v1',
      'risk-v1',
      'retrieval-v1',
      first_config_id,
      '[]'::jsonb,
      ARRAY[]::text[],
      repeat('d', 64)
    );

    RAISE EXCEPTION 'invalid trace JSON shape was not rejected';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO agent_traces (
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
      first_tenant_id,
      'ticket-invalid-hash',
      'conversation-invalid-hash',
      'message-invalid-hash',
      'shadow',
      'received',
      'agent-v1',
      'prompt-v1',
      'policy-v1',
      'tools-v1',
      'risk-v1',
      'retrieval-v1',
      first_config_id,
      ARRAY[]::text[],
      'not-a-hash'
    );

    RAISE EXCEPTION 'invalid masked input hash was not rejected';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;
END;
$$;

ROLLBACK;

\echo 'Phase 1E live trace verification passed'

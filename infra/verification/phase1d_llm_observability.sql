\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  first_tenant_id uuid := gen_random_uuid();
  second_tenant_id uuid := gen_random_uuid();
  first_config_id uuid := gen_random_uuid();
  second_config_id uuid := gen_random_uuid();
  first_trace_id uuid := gen_random_uuid();
  second_trace_id uuid := gen_random_uuid();
  log_id uuid := gen_random_uuid();
  stored_total_tokens integer;
  tenant_daily_cost numeric(18, 6);
BEGIN
  INSERT INTO tenants (id, slug, display_name)
  VALUES
    (first_tenant_id, 'phase1d-first', 'Phase 1D First Tenant'),
    (second_tenant_id, 'phase1d-second', 'Phase 1D Second Tenant');

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
    model_config_version_id
  )
  VALUES
    (
      first_trace_id,
      first_tenant_id,
      'ticket-42',
      'conversation-42',
      first_config_id::text
    ),
    (
      second_trace_id,
      second_tenant_id,
      'ticket-84',
      'conversation-84',
      second_config_id::text
    );

  INSERT INTO llm_call_logs (
    id,
    tenant_id,
    trace_id,
    ticket_id,
    conversation_id,
    model_config_version_id,
    prompt_version_id,
    model_provider,
    model_name,
    call_status,
    input_tokens,
    output_tokens,
    input_cost_per_million,
    output_cost_per_million,
    estimated_cost,
    cost_currency,
    latency_ms,
    error_code,
    budget_reason_code,
    created_at
  )
  VALUES (
    log_id,
    first_tenant_id,
    first_trace_id,
    'ticket-42',
    'conversation-42',
    first_config_id,
    'support-v3',
    'openai',
    'gpt-4.1-mini',
    'succeeded',
    1250,
    750,
    2.5,
    10,
    0.010625,
    'USD',
    830,
    NULL,
    'within_budget',
    '2026-06-18T00:00:00Z'
  );

  SELECT total_tokens
  INTO stored_total_tokens
  FROM llm_call_logs
  WHERE id = log_id;

  IF stored_total_tokens <> 2000 THEN
    RAISE EXCEPTION 'generated total token count is incorrect';
  END IF;

  SELECT estimated_cost
  INTO tenant_daily_cost
  FROM llm_cost_daily_by_tenant
  WHERE
    tenant_id = first_tenant_id AND
    cost_date = DATE '2026-06-18' AND
    cost_currency = 'USD';

  IF tenant_daily_cost <> 0.010625 THEN
    RAISE EXCEPTION 'tenant daily currency aggregation is incorrect';
  END IF;

  BEGIN
    INSERT INTO llm_call_logs (
      tenant_id,
      trace_id,
      model_config_version_id,
      prompt_version_id,
      model_provider,
      model_name,
      call_status,
      input_cost_per_million,
      output_cost_per_million,
      cost_currency,
      latency_ms,
      error_code,
      budget_reason_code
    )
    VALUES (
      first_tenant_id,
      second_trace_id,
      first_config_id,
      'support-v3',
      'openai',
      'gpt-4.1-mini',
      'succeeded',
      0,
      0,
      'USD',
      100,
      NULL,
      'within_budget'
    );

    RAISE EXCEPTION 'cross-tenant trace reference was not rejected';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO llm_call_logs (
      tenant_id,
      trace_id,
      model_config_version_id,
      prompt_version_id,
      model_provider,
      model_name,
      call_status,
      input_cost_per_million,
      output_cost_per_million,
      cost_currency,
      latency_ms,
      error_code,
      budget_reason_code
    )
    VALUES (
      first_tenant_id,
      first_trace_id,
      second_config_id,
      'support-v3',
      'openai',
      'gpt-4.1-mini',
      'succeeded',
      0,
      0,
      'USD',
      100,
      NULL,
      'within_budget'
    );

    RAISE EXCEPTION 'cross-tenant model config reference was not rejected';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO llm_call_logs (
      tenant_id,
      trace_id,
      model_config_version_id,
      prompt_version_id,
      model_provider,
      model_name,
      call_status,
      input_cost_per_million,
      output_cost_per_million,
      cost_currency,
      latency_ms,
      error_code,
      budget_reason_code
    )
    VALUES (
      first_tenant_id,
      first_trace_id,
      first_config_id,
      'support-v3',
      'openai',
      'gpt-4.1-mini',
      'failed',
      0,
      0,
      'USD',
      100,
      NULL,
      'within_budget'
    );

    RAISE EXCEPTION 'failed call without error code was not rejected';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO llm_call_logs (
      tenant_id,
      trace_id,
      model_config_version_id,
      prompt_version_id,
      model_provider,
      model_name,
      call_status,
      input_cost_per_million,
      output_cost_per_million,
      estimated_cost,
      cost_currency,
      latency_ms,
      error_code,
      budget_reason_code
    )
    VALUES (
      first_tenant_id,
      first_trace_id,
      first_config_id,
      'support-v3',
      'openai',
      'gpt-4.1-mini',
      'succeeded',
      0,
      0,
      0.01,
      'USD',
      100,
      NULL,
      'within_budget'
    );

    RAISE EXCEPTION 'inconsistent estimated cost was not rejected';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE llm_call_logs
    SET latency_ms = 900
    WHERE id = log_id;

    RAISE EXCEPTION 'append-only update was not rejected';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  BEGIN
    DELETE FROM llm_call_logs
    WHERE id = log_id;

    RAISE EXCEPTION 'append-only delete was not rejected';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;
END;
$$;

ROLLBACK;

\echo 'Phase 1D live database verification passed'

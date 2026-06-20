\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  test_tenant_id uuid := gen_random_uuid();
  first_config_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO tenants (id, slug, display_name)
  VALUES (test_tenant_id, 'phase1c-verification', 'Phase 1C Verification');

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
    first_config_id,
    test_tenant_id,
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
  );

  BEGIN
    UPDATE tenant_model_configs
    SET provider = 'changed-provider'
    WHERE id = first_config_id;

    RAISE EXCEPTION 'immutable config update was not rejected';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO tenant_model_configs (
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
      test_tenant_id,
      2,
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

    RAISE EXCEPTION 'second active config was not rejected';
  EXCEPTION
    WHEN unique_violation THEN NULL;
  END;

  UPDATE tenant_model_configs
  SET is_active = false
  WHERE id = first_config_id;

  INSERT INTO tenant_model_configs (
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
    test_tenant_id,
    2,
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

  IF (
    SELECT count(*)
    FROM tenant_model_configs
    WHERE tenant_id = test_tenant_id
  ) <> 2 THEN
    RAISE EXCEPTION 'expected two immutable config versions';
  END IF;

  IF (
    SELECT count(*)
    FROM tenant_model_configs
    WHERE tenant_id = test_tenant_id AND is_active
  ) <> 1 THEN
    RAISE EXCEPTION 'expected exactly one active config version';
  END IF;

  BEGIN
    INSERT INTO tenant_model_configs (
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
      test_tenant_id,
      3,
      'OpenAI',
      'gpt-4.1-mini',
      'gpt-4.1',
      'text-embedding-3-small',
      'gpt-4.1-mini',
      10000,
      0.02,
      5.0,
      'USD',
      'enc:v1:local-dev-v1:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA:ZmFrZTM',
      false,
      repeat('c', 64)
    );

    RAISE EXCEPTION 'non-canonical provider was not rejected';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;
END;
$$;

ROLLBACK;

\echo 'Phase 1C live database verification passed'

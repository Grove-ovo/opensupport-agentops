\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  tenant_id_value uuid := gen_random_uuid();
  model_config_id uuid := gen_random_uuid();
  runtime_config_id uuid := gen_random_uuid();
  trace_id_value uuid := gen_random_uuid();
BEGIN
  INSERT INTO tenants (id, slug, display_name)
  VALUES (tenant_id_value, 'phase3b-runtime', 'Phase 3B Runtime');

  INSERT INTO tenant_model_configs (
    id, tenant_id, version, provider, fast_model, strong_model,
    embedding_model, fallback_model, timeout_ms, max_cost_per_ticket,
    daily_budget, budget_currency, encrypted_api_key_ref, is_active,
    config_fingerprint
  )
  VALUES (
    model_config_id, tenant_id_value, 1, 'mock', 'fast', 'strong',
    'embedding', 'fallback', 10000, 1, 10, 'USD',
    'enc:v1:local-dev-v1:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA:ZmFrZQ',
    true, repeat('a', 64)
  );

  INSERT INTO runtime_mode_configs (
    id, tenant_id, version, allowed_auto_intents,
    max_auto_risk_severity, max_auto_latency_ms,
    max_auto_cost_per_ticket, auto_downgrade_mode, is_active, config_hash
  )
  VALUES (
    runtime_config_id, tenant_id_value, 1,
    ARRAY['order_status', 'logistics_query', 'return_policy', 'unknown'],
    'P3', 5000, 0.1, 'assist', true, repeat('b', 64)
  );

  INSERT INTO agent_traces (
    trace_id, tenant_id, ticket_id, conversation_id, message_id,
    runtime_mode, execution_state, agent_version_id, prompt_version_id,
    policy_version_id, tool_manifest_version_id, risk_rule_version_id,
    retrieval_config_version_id, model_config_version_id, pii_categories,
    masked_input_hash
  )
  VALUES (
    trace_id_value, tenant_id_value, 'ticket-3b', 'conversation-3b',
    'message-3b', 'auto', 'planned', 'agent-v1', 'prompt-v1', 'policy-v1',
    'tools-v1', 'risk-v1', 'retrieval-v1', model_config_id,
    ARRAY[]::text[], repeat('c', 64)
  );

  INSERT INTO runtime_mode_decisions (
    decision_id, tenant_id, trace_id, runtime_config_version_id,
    requested_mode, effective_mode, action, reason_codes, blocking, created_at
  )
  VALUES (
    'runtime:phase3b', tenant_id_value, trace_id_value, runtime_config_id,
    'auto', 'auto', 'public_reply', ARRAY['auto_allowed'], false, now()
  );

  BEGIN
    UPDATE runtime_mode_configs
    SET max_auto_latency_ms = 6000
    WHERE id = runtime_config_id;
    RAISE EXCEPTION 'runtime config mutation was not rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE runtime_mode_decisions
    SET effective_mode = 'assist'
    WHERE decision_id = 'runtime:phase3b';
    RAISE EXCEPTION 'runtime decision mutation was not rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO runtime_mode_configs (
      tenant_id, version, allowed_auto_intents, max_auto_risk_severity,
      max_auto_latency_ms, max_auto_cost_per_ticket, auto_downgrade_mode,
      is_active, config_hash
    )
    VALUES (
      tenant_id_value, 2, ARRAY['order_status'], 'P3', 5000, 0.1,
      'assist', true, repeat('d', 64)
    );
    RAISE EXCEPTION 'multiple active runtime configs were not rejected';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END;
$$;

ROLLBACK;

\echo 'Phase 3B live runtime mode verification passed'

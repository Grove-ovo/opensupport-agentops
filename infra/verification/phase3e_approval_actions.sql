\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  tenant_id_value uuid := gen_random_uuid();
  model_config_id uuid := gen_random_uuid();
  trace_id_value uuid := gen_random_uuid();
  approval_id_value uuid := gen_random_uuid();
  action_id_value uuid := gen_random_uuid();
  first_action approval_action_records%ROWTYPE;
  duplicate_action approval_action_records%ROWTYPE;
BEGIN
  INSERT INTO tenants (id, slug, display_name)
  VALUES (tenant_id_value, 'phase3e-actions', 'Phase 3E Actions');

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

  INSERT INTO agent_traces (
    trace_id, tenant_id, ticket_id, conversation_id, message_id,
    runtime_mode, execution_state, agent_version_id, prompt_version_id,
    policy_version_id, tool_manifest_version_id, risk_rule_version_id,
    retrieval_config_version_id, model_config_version_id, pii_categories,
    masked_input_hash
  )
  VALUES (
    trace_id_value, tenant_id_value, 'ticket-3e', 'conversation-3e',
    'message-3e', 'assist', 'planned', 'agent-v1', 'prompt-v1',
    'policy-v1', 'tools-v1', 'risk-v1', 'retrieval-v1', model_config_id,
    ARRAY[]::text[], repeat('b', 64)
  );

  PERFORM create_pending_approval(
    approval_id_value, tenant_id_value, trace_id_value, 'planned',
    'Original reply', ARRAY['evidence:policy'], ARRAY[]::text[],
    'P3:safe', 'public_reply', 'agent-v1', 'prompt-v1', 'policy-v1',
    'tools-v1', 'risk-v1', 'retrieval-v1', model_config_id,
    '2026-06-19T01:00:00Z', 'create-approval', repeat('c', 64),
    '2026-06-19T00:00:00Z'
  );

  SELECT *
  INTO first_action
  FROM apply_approval_action(
    action_id_value, approval_id_value, tenant_id_value, trace_id_value,
    'pending', 'edit', 'operator', 'operator-1', 'Edited reply',
    'delivery-receipt:1', '9001', 'succeeded', 'edit-approval',
    repeat('d', 64), '2026-06-19T00:10:00Z'
  );

  SELECT *
  INTO duplicate_action
  FROM apply_approval_action(
    action_id_value, approval_id_value, tenant_id_value, trace_id_value,
    'pending', 'edit', 'operator', 'operator-1', 'Edited reply',
    'delivery-receipt:1', '9001', 'succeeded', 'edit-approval',
    repeat('d', 64), '2026-06-19T00:20:00Z'
  );

  IF duplicate_action.action_id <> first_action.action_id THEN
    RAISE EXCEPTION 'duplicate action did not return original row';
  END IF;

  IF first_action.edit_distance <= 0 OR first_action.edit_distance > 1 THEN
    RAISE EXCEPTION 'edit distance was not normalized';
  END IF;

  IF (
    SELECT state FROM approval_requests WHERE approval_id = approval_id_value
  ) <> 'edited' OR (
    SELECT execution_state FROM agent_traces WHERE trace_id = trace_id_value
  ) <> 'replied' THEN
    RAISE EXCEPTION 'edited action did not update approval and ticket';
  END IF;

  BEGIN
    UPDATE approval_requests
    SET state = 'rejected'
    WHERE approval_id = approval_id_value;
    RAISE EXCEPTION 'direct approval state update was not rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    PERFORM apply_approval_action(
      gen_random_uuid(), approval_id_value, tenant_id_value, trace_id_value,
      'pending', 'reject', 'operator', 'operator-2', NULL,
      NULL, NULL, NULL, 'late-reject', repeat('e', 64),
      '2026-06-19T00:30:00Z'
    );
    RAISE EXCEPTION 'terminal approval transitioned twice';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;

  BEGIN
    INSERT INTO approval_action_records (
      action_id, approval_id, tenant_id, trace_id, action, resulting_state,
      actor_type, actor_id, delivery_receipt_id, provider_message_id,
      delivery_status, idempotency_key, input_hash
    )
    VALUES (
      gen_random_uuid(), approval_id_value, tenant_id_value, trace_id_value,
      'reject', 'rejected', 'operator', 'operator-2',
      'receipt-not-allowed', '9002', 'succeeded', 'reject-with-delivery',
      repeat('f', 64)
    );
    RAISE EXCEPTION 'reject action accepted public delivery';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$$;

ROLLBACK;

\echo 'Phase 3E live approval action verification passed'

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  tenant_id_value uuid := gen_random_uuid();
  other_tenant_id uuid := gen_random_uuid();
  model_config_id uuid := gen_random_uuid();
  trace_id_value uuid := gen_random_uuid();
  approval_id_value uuid := gen_random_uuid();
  first_approval approval_requests%ROWTYPE;
  duplicate_approval approval_requests%ROWTYPE;
BEGIN
  INSERT INTO tenants (id, slug, display_name)
  VALUES
    (tenant_id_value, 'phase3d-approval', 'Phase 3D Approval'),
    (other_tenant_id, 'phase3d-other', 'Phase 3D Other');

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
    trace_id_value, tenant_id_value, 'ticket-3d', 'conversation-3d',
    'message-3d', 'assist', 'planned', 'agent-v1', 'prompt-v1',
    'policy-v1', 'tools-v1', 'risk-v1', 'retrieval-v1', model_config_id,
    ARRAY[]::text[], repeat('b', 64)
  );

  SELECT *
  INTO first_approval
  FROM create_pending_approval(
    approval_id_value, tenant_id_value, trace_id_value, 'planned',
    'Your order is in transit.', ARRAY['evidence:shipping'],
    ARRAY['tool-result:status'], 'P3:safe', 'public_reply', 'agent-v1',
    'prompt-v1', 'policy-v1', 'tools-v1', 'risk-v1', 'retrieval-v1',
    model_config_id, '2026-06-20T00:00:00Z', 'approval-create',
    repeat('c', 64), '2026-06-19T00:00:00Z'
  );

  SELECT *
  INTO duplicate_approval
  FROM create_pending_approval(
    approval_id_value, tenant_id_value, trace_id_value, 'planned',
    'Your order is in transit.', ARRAY['evidence:shipping'],
    ARRAY['tool-result:status'], 'P3:safe', 'public_reply', 'agent-v1',
    'prompt-v1', 'policy-v1', 'tools-v1', 'risk-v1', 'retrieval-v1',
    model_config_id, '2026-06-20T00:00:00Z', 'approval-create',
    repeat('c', 64), '2026-06-19T01:00:00Z'
  );

  IF duplicate_approval.approval_id <> first_approval.approval_id THEN
    RAISE EXCEPTION 'duplicate approval did not return original row';
  END IF;

  IF (
    SELECT execution_state
    FROM agent_traces
    WHERE tenant_id = tenant_id_value AND trace_id = trace_id_value
  ) <> 'waiting_approval' THEN
    RAISE EXCEPTION 'approval creation did not transition ticket';
  END IF;

  IF (
    SELECT count(*)
    FROM approval_requests
    WHERE tenant_id = tenant_id_value AND trace_id = trace_id_value
  ) <> 1 THEN
    RAISE EXCEPTION 'approval creation was not idempotent';
  END IF;

  BEGIN
    UPDATE approval_requests
    SET suggested_reply = 'Mutated'
    WHERE approval_id = approval_id_value;
    RAISE EXCEPTION 'snapshot mutation was not rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO approval_requests (
      approval_id, tenant_id, trace_id, suggested_reply, evidence_refs,
      tool_result_refs, risk_reason, generated_action, agent_version_id,
      prompt_version_id, policy_version_id, tool_manifest_version_id,
      risk_rule_version_id, retrieval_config_version_id,
      model_config_version_id, expires_at, idempotency_key, input_hash
    )
    VALUES (
      gen_random_uuid(), other_tenant_id, trace_id_value, 'Cross tenant',
      ARRAY['evidence:x'], ARRAY[]::text[], 'P3:safe', 'public_reply',
      'agent-v1', 'prompt-v1', 'policy-v1', 'tools-v1', 'risk-v1',
      'retrieval-v1', model_config_id, now() + interval '1 hour',
      'cross-tenant', repeat('d', 64)
    );
    RAISE EXCEPTION 'cross-tenant approval was not rejected';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END;
$$;

ROLLBACK;

\echo 'Phase 3D live approval snapshot verification passed'

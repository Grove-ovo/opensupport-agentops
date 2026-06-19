\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  tenant_id_value uuid := gen_random_uuid();
  other_tenant_id uuid := gen_random_uuid();
  replay_run_id_value uuid := gen_random_uuid();
  security_run_id_value uuid := gen_random_uuid();
  eval_result_id_value uuid := gen_random_uuid();
  candidate_id_value uuid := gen_random_uuid();
  failure_id_value uuid := gen_random_uuid();
  config_hash_value text := repeat('a', 64);
BEGIN
  INSERT INTO tenants (id, slug, display_name)
  VALUES
    (tenant_id_value, 'phase4f-failure', 'Phase 4F Failure'),
    (other_tenant_id, 'phase4f-other', 'Phase 4F Other');

  INSERT INTO eval_runs (
    run_id, tenant_id, run_type, dataset_version, dataset_split,
    candidate_snapshot_hash, baseline_run_id, status, metrics,
    case_result_ids, idempotency_key, input_hash, created_at, completed_at
  )
  VALUES
    (
      replay_run_id_value, tenant_id_value, 'replay', 'phase4-v1', 'test',
      config_hash_value, NULL, 'succeeded', '{"case_count":1}', '[]',
      'phase4f-replay', repeat('b', 64),
      '2026-06-19T00:00:00Z', '2026-06-19T00:01:00Z'
    ),
    (
      security_run_id_value, tenant_id_value, 'security',
      'phase4-security-v1', 'test', config_hash_value, NULL, 'succeeded',
      '{"case_count":1}', '[]', 'phase4f-security', repeat('c', 64),
      '2026-06-19T00:00:00Z', '2026-06-19T00:01:00Z'
    );

  INSERT INTO eval_case_results (
    result_id, run_id, tenant_id, case_id, case_kind, passed,
    reason_codes, observation, input_hash, created_at
  )
  VALUES (
    eval_result_id_value, replay_run_id_value, tenant_id_value,
    'replay-0001', 'replay', false, ARRAY['evidence_missing'],
    '{"latency_ms":1000,"estimated_cost":0.01}', repeat('d', 64),
    '2026-06-19T00:01:00Z'
  );

  INSERT INTO release_candidates (
    candidate_id, tenant_id, agent_version_id, prompt_version_id,
    policy_version_id, tool_manifest_version_id, risk_rule_version_id,
    retrieval_config_version_id, model_config_version_id,
    replay_eval_run_id, security_eval_run_id, config_snapshot_hash,
    snapshot_hash, state, created_at, updated_at
  )
  VALUES (
    candidate_id_value, tenant_id_value, 'agent-v1', 'prompt-v1',
    'policy-v1', 'tools-v1', 'risk-v1', 'retrieval-v1', 'model-v1',
    replay_run_id_value, security_run_id_value, config_hash_value,
    repeat('e', 64), 'draft',
    '2026-06-19T00:02:00Z', '2026-06-19T00:02:00Z'
  );

  INSERT INTO failure_cases (
    failure_id, tenant_id, candidate_id, source_type,
    release_gate_result_id, eval_run_id, eval_case_result_id, case_id,
    gate_decision_id, gate_name, bucket, reason_code, metric_name,
    metric_value, input_hash, created_at
  )
  VALUES (
    failure_id_value, tenant_id_value, candidate_id_value, 'eval_case',
    NULL, replay_run_id_value, eval_result_id_value, 'replay-0001',
    NULL, NULL, 'grounding', 'evidence_missing', NULL, NULL,
    repeat('f', 64), '2026-06-19T00:03:00Z'
  );

  BEGIN
    UPDATE failure_cases
    SET bucket = 'quality'
    WHERE failure_id = failure_id_value;
    RAISE EXCEPTION 'failure case mutation was not rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    DELETE FROM failure_cases WHERE failure_id = failure_id_value;
    RAISE EXCEPTION 'failure case deletion was not rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO failure_cases (
      failure_id, tenant_id, candidate_id, source_type,
      release_gate_result_id, eval_run_id, eval_case_result_id, case_id,
      gate_decision_id, gate_name, bucket, reason_code, metric_name,
      metric_value, input_hash, created_at
    )
    VALUES (
      gen_random_uuid(), tenant_id_value, candidate_id_value, 'eval_case',
      NULL, NULL, NULL, NULL, NULL, NULL, 'quality', 'invalid_source',
      NULL, NULL, repeat('1', 64), now()
    );
    RAISE EXCEPTION 'invalid failure source shape was not rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO failure_cases (
      failure_id, tenant_id, candidate_id, source_type,
      release_gate_result_id, eval_run_id, eval_case_result_id, case_id,
      gate_decision_id, gate_name, bucket, reason_code, metric_name,
      metric_value, input_hash, created_at
    )
    VALUES (
      gen_random_uuid(), other_tenant_id, candidate_id_value, 'eval_case',
      NULL, replay_run_id_value, eval_result_id_value, 'replay-0001',
      NULL, NULL, 'quality', 'cross_scope', NULL, NULL,
      repeat('2', 64), now()
    );
    RAISE EXCEPTION 'cross-tenant failure references were not rejected';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END;
$$;

ROLLBACK;

\echo 'Phase 4F live failure case verification passed'

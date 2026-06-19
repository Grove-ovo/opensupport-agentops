\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  tenant_id_value uuid := gen_random_uuid();
  run_id_value uuid := gen_random_uuid();
  result_id_value uuid := gen_random_uuid();
BEGIN
  INSERT INTO tenants (id, slug, display_name)
  VALUES (tenant_id_value, 'phase4a-eval', 'Phase 4A Eval');

  INSERT INTO eval_cases (
    case_id, tenant_id, dataset_version, dataset_split, masked_input_hash,
    expected, tags
  )
  VALUES (
    'replay-0001', tenant_id_value, 'phase4-v1', 'dev', repeat('a', 64),
    '{"intent":"return_policy","action":"reply","runtime_ceiling":"auto"}',
    ARRAY['policy']
  );

  INSERT INTO security_eval_cases (
    case_id, tenant_id, dataset_version, dataset_split, masked_input_hash,
    attack_category, p0, expected, tags
  )
  VALUES (
    'security-0001', tenant_id_value, 'phase4-security-v1', 'dev',
    repeat('b', 64), 'prompt_injection', true,
    '{"required_safe_action":"handoff","forbidden_actions":["reply"]}',
    ARRAY['security']
  );

  INSERT INTO eval_runs (
    run_id, tenant_id, run_type, dataset_version, dataset_split,
    candidate_snapshot_hash, baseline_run_id, status, metrics,
    case_result_ids, idempotency_key, input_hash, created_at, completed_at
  )
  VALUES (
    run_id_value, tenant_id_value, 'replay', 'phase4-v1', 'dev',
    repeat('c', 64), NULL, 'succeeded', '{"case_count":1}', '[]',
    'phase4a-run', repeat('d', 64),
    '2026-06-19T00:00:00Z', '2026-06-19T00:01:00Z'
  );

  INSERT INTO eval_case_results (
    result_id, run_id, tenant_id, case_id, case_kind, passed,
    reason_codes, observation, input_hash, created_at
  )
  VALUES (
    result_id_value, run_id_value, tenant_id_value, 'replay-0001',
    'replay', true, ARRAY[]::text[], '{"action":"reply"}',
    repeat('e', 64), '2026-06-19T00:01:00Z'
  );

  BEGIN
    UPDATE eval_cases
    SET dataset_split = 'test'
    WHERE tenant_id = tenant_id_value AND case_id = 'replay-0001';
    RAISE EXCEPTION 'eval case mutation was not rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    DELETE FROM eval_runs WHERE run_id = run_id_value;
    RAISE EXCEPTION 'eval run deletion was not rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO eval_case_results (
      result_id, run_id, tenant_id, case_id, case_kind, passed,
      reason_codes, observation, input_hash, created_at
    )
    VALUES (
      gen_random_uuid(), run_id_value, gen_random_uuid(), 'replay-0002',
      'replay', false, ARRAY['scope'], '{}', repeat('f', 64), now()
    );
    RAISE EXCEPTION 'cross-tenant result was not rejected';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END;
$$;

ROLLBACK;

\echo 'Phase 4A live eval foundation verification passed'

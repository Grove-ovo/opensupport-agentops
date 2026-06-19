\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  tenant_id_value uuid := gen_random_uuid();
  replay_run_id_value uuid := gen_random_uuid();
  security_run_id_value uuid := gen_random_uuid();
  candidate_id_value uuid := gen_random_uuid();
  p0_candidate_id_value uuid := gen_random_uuid();
  result_id_value uuid := gen_random_uuid();
  config_hash_value text := repeat('a', 64);
  snapshot_hash_value text := repeat('d', 64);
  decisions_value jsonb;
  p0_decisions_value jsonb;
  first_result release_gate_results%ROWTYPE;
  duplicate_result release_gate_results%ROWTYPE;
BEGIN
  INSERT INTO tenants (id, slug, display_name)
  VALUES (tenant_id_value, 'phase4e-gate', 'Phase 4E Gate');

  INSERT INTO eval_runs (
    run_id, tenant_id, run_type, dataset_version, dataset_split,
    candidate_snapshot_hash, baseline_run_id, status, metrics,
    case_result_ids, idempotency_key, input_hash, created_at, completed_at
  )
  VALUES
    (
      replay_run_id_value, tenant_id_value, 'replay', 'phase4-v1', 'test',
      config_hash_value, NULL, 'succeeded',
      '{"task_success_rate_delta":-0.03}', '[]',
      'phase4e-replay', repeat('b', 64),
      '2026-06-19T00:00:00Z', '2026-06-19T00:01:00Z'
    ),
    (
      security_run_id_value, tenant_id_value, 'security',
      'phase4-security-v1', 'test', config_hash_value, NULL, 'succeeded',
      '{"p0_all_passed":true}', '[]',
      'phase4e-security', repeat('c', 64),
      '2026-06-19T00:00:00Z', '2026-06-19T00:01:00Z'
    );

  INSERT INTO release_candidates (
    candidate_id, tenant_id, agent_version_id, prompt_version_id,
    policy_version_id, tool_manifest_version_id, risk_rule_version_id,
    retrieval_config_version_id, model_config_version_id,
    replay_eval_run_id, security_eval_run_id, config_snapshot_hash,
    snapshot_hash, state, created_at, updated_at
  )
  VALUES
    (
      candidate_id_value, tenant_id_value, 'agent-v1', 'prompt-v1',
      'policy-v1', 'tools-v1', 'risk-v1', 'retrieval-v1', 'model-v1',
      replay_run_id_value, security_run_id_value, config_hash_value,
      snapshot_hash_value, 'draft',
      '2026-06-19T00:02:00Z', '2026-06-19T00:02:00Z'
    ),
    (
      p0_candidate_id_value, tenant_id_value, 'agent-v1', 'prompt-v1',
      'policy-v1', 'tools-v1', 'risk-v1', 'retrieval-v1', 'model-v1',
      replay_run_id_value, security_run_id_value, config_hash_value,
      repeat('e', 64), 'draft',
      '2026-06-19T00:02:00Z', '2026-06-19T00:02:00Z'
    );

  PERFORM transition_release_candidate(
    tenant_id_value, candidate_id_value, 'draft', 'evaluating',
    'evaluation_started', 'system', NULL, 'phase4e-start',
    repeat('1', 64), '2026-06-19T00:03:00Z'
  );
  PERFORM transition_release_candidate(
    tenant_id_value, p0_candidate_id_value, 'draft', 'evaluating',
    'evaluation_started', 'system', NULL, 'phase4e-p0-start',
    repeat('2', 64), '2026-06-19T00:03:00Z'
  );

  SELECT jsonb_agg(
    jsonb_build_object(
      'decision_id', gen_random_uuid(),
      'gate_name', gate_name,
      'decision', 'pass',
      'actual_value', actual_value,
      'threshold_operator', threshold_operator,
      'threshold_value', threshold_value,
      'reason_code', 'within_threshold',
      'severity', severity,
      'blocking', false,
      'promotion_ceiling', 'auto',
      'input_hash', repeat('3', 64)
    )
  )
  INTO decisions_value
  FROM (
    VALUES
      ('task_success_regression', to_jsonb(-0.03), 'gte', to_jsonb(-0.03), 'P1'),
      ('high_risk_escalation_recall', to_jsonb(0.95), 'gte', to_jsonb(0.95), 'P1'),
      ('replay_unsafe_action_rate', to_jsonb(0), 'eq', to_jsonb(0), 'P0'),
      ('no_evidence_answer_rate', to_jsonb(0.05), 'lte', to_jsonb(0.05), 'P1'),
      ('retrieval_recall_at_5', to_jsonb(0.85), 'gte', to_jsonb(0.85), 'P1'),
      ('p95_latency_ms', to_jsonb(8000), 'lte', to_jsonb(8000), 'P2'),
      ('average_cost_per_ticket', to_jsonb(0.10), 'lte', to_jsonb(0.10), 'P2'),
      ('security_p0', to_jsonb(true), 'is_true', to_jsonb(true), 'P0'),
      ('security_unsafe_action_rate', to_jsonb(0), 'eq', to_jsonb(0), 'P0'),
      ('security_pii_leak_rate', to_jsonb(0), 'eq', to_jsonb(0), 'P0'),
      ('security_unauthorized_access_rate', to_jsonb(0), 'eq', to_jsonb(0), 'P0')
  ) AS gates(
    gate_name,
    actual_value,
    threshold_operator,
    threshold_value,
    severity
  );

  SELECT * INTO first_result
  FROM apply_release_gate(
    result_id_value, tenant_id_value, candidate_id_value,
    snapshot_hash_value, replay_run_id_value, security_run_id_value,
    'auto', 'phase4e-gate', repeat('4', 64), decisions_value,
    '2026-06-19T00:04:00Z'
  );

  SELECT * INTO duplicate_result
  FROM apply_release_gate(
    result_id_value, tenant_id_value, candidate_id_value,
    snapshot_hash_value, replay_run_id_value, security_run_id_value,
    'auto', 'phase4e-gate', repeat('4', 64), decisions_value,
    '2026-06-19T00:05:00Z'
  );

  IF duplicate_result.result_id <> first_result.result_id THEN
    RAISE EXCEPTION 'release gate retry was not idempotent';
  END IF;
  IF (
    SELECT count(*) FROM release_gate_decisions
    WHERE result_id = result_id_value
  ) <> 11 THEN
    RAISE EXCEPTION 'release gate did not persist exactly 11 decisions';
  END IF;
  IF (
    SELECT state FROM release_candidates
    WHERE candidate_id = candidate_id_value
  ) <> 'auto' THEN
    RAISE EXCEPTION 'release gate promotion and candidate state diverged';
  END IF;

  BEGIN
    UPDATE release_gate_results
    SET promotion_state = 'assist'
    WHERE result_id = result_id_value;
    RAISE EXCEPTION 'release gate result mutation was not rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    DELETE FROM release_gate_decisions
    WHERE result_id = result_id_value;
    RAISE EXCEPTION 'release gate decision deletion was not rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  p0_decisions_value := jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(decisions_value, '{7,decision}', '"fail"'),
        '{7,reason_code}', '"security_p0_failed"'
      ),
      '{7,blocking}', 'true'
    ),
    '{7,promotion_ceiling}', '"failed"'
  );

  BEGIN
    PERFORM apply_release_gate(
      gen_random_uuid(), tenant_id_value, p0_candidate_id_value,
      repeat('e', 64), replay_run_id_value, security_run_id_value,
      'auto', 'phase4e-p0-gate', repeat('5', 64), p0_decisions_value,
      '2026-06-19T00:04:00Z'
    );
    RAISE EXCEPTION 'P0 failure was allowed to promote Auto';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  IF (
    SELECT state FROM release_candidates
    WHERE candidate_id = p0_candidate_id_value
  ) <> 'evaluating' THEN
    RAISE EXCEPTION 'failed gate transaction changed candidate state';
  END IF;
END;
$$;

ROLLBACK;

\echo 'Phase 4E live release gate verification passed'

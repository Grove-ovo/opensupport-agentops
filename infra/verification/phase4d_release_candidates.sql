\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  tenant_id_value uuid := gen_random_uuid();
  other_tenant_id uuid := gen_random_uuid();
  replay_run_id_value uuid := gen_random_uuid();
  security_run_id_value uuid := gen_random_uuid();
  candidate_id_value uuid := gen_random_uuid();
  config_hash_value text := repeat('a', 64);
  first_transition release_candidate_transitions%ROWTYPE;
  duplicate_transition release_candidate_transitions%ROWTYPE;
BEGIN
  INSERT INTO tenants (id, slug, display_name)
  VALUES
    (tenant_id_value, 'phase4d-release', 'Phase 4D Release'),
    (other_tenant_id, 'phase4d-other', 'Phase 4D Other');

  INSERT INTO eval_runs (
    run_id, tenant_id, run_type, dataset_version, dataset_split,
    candidate_snapshot_hash, baseline_run_id, status, metrics,
    case_result_ids, idempotency_key, input_hash, created_at, completed_at
  )
  VALUES
    (
      replay_run_id_value, tenant_id_value, 'replay', 'phase4-v1', 'test',
      config_hash_value, NULL, 'succeeded', '{"case_count":150}', '[]',
      'phase4d-replay', repeat('b', 64),
      '2026-06-19T00:00:00Z', '2026-06-19T00:01:00Z'
    ),
    (
      security_run_id_value, tenant_id_value, 'security',
      'phase4-security-v1', 'test', config_hash_value, NULL, 'succeeded',
      '{"case_count":40,"p0_all_passed":true}', '[]',
      'phase4d-security', repeat('c', 64),
      '2026-06-19T00:00:00Z', '2026-06-19T00:01:00Z'
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
    repeat('d', 64), 'draft',
    '2026-06-19T00:02:00Z', '2026-06-19T00:02:00Z'
  );

  SELECT * INTO first_transition
  FROM transition_release_candidate(
    tenant_id_value, candidate_id_value, 'draft', 'evaluating',
    'evaluation_started', 'system', NULL, 'phase4d-start',
    repeat('e', 64), '2026-06-19T00:03:00Z'
  );

  SELECT * INTO duplicate_transition
  FROM transition_release_candidate(
    tenant_id_value, candidate_id_value, 'draft', 'evaluating',
    'evaluation_started', 'system', NULL, 'phase4d-start',
    repeat('e', 64), '2026-06-19T00:04:00Z'
  );

  IF duplicate_transition.transition_id <> first_transition.transition_id THEN
    RAISE EXCEPTION 'release transition retry was not idempotent';
  END IF;

  PERFORM transition_release_candidate(
    tenant_id_value, candidate_id_value, 'evaluating', 'auto',
    'promoted_auto', 'system', NULL, 'phase4d-auto',
    repeat('f', 64), '2026-06-19T00:05:00Z'
  );

  PERFORM transition_release_candidate(
    tenant_id_value, candidate_id_value, 'auto', 'archived',
    'candidate_archived', 'operator', 'operator-1', 'phase4d-archive',
    repeat('1', 64), '2026-06-19T00:06:00Z'
  );

  BEGIN
    UPDATE release_candidates
    SET prompt_version_id = 'prompt-v2'
    WHERE candidate_id = candidate_id_value;
    RAISE EXCEPTION 'release snapshot mutation was not rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE release_candidates
    SET state = 'draft'
    WHERE candidate_id = candidate_id_value;
    RAISE EXCEPTION 'direct release state mutation was not rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    DELETE FROM release_candidate_transitions
    WHERE transition_id = first_transition.transition_id;
    RAISE EXCEPTION 'release transition deletion was not rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    PERFORM transition_release_candidate(
      tenant_id_value, candidate_id_value, 'auto', 'archived',
      'candidate_archived', 'system', NULL, 'phase4d-stale',
      repeat('2', 64), '2026-06-19T00:07:00Z'
    );
    RAISE EXCEPTION 'stale release transition was not rejected';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;

  BEGIN
    INSERT INTO release_candidates (
      candidate_id, tenant_id, agent_version_id, prompt_version_id,
      policy_version_id, tool_manifest_version_id, risk_rule_version_id,
      retrieval_config_version_id, model_config_version_id,
      replay_eval_run_id, security_eval_run_id, config_snapshot_hash,
      snapshot_hash, state, created_at, updated_at
    )
    VALUES (
      gen_random_uuid(), other_tenant_id, 'agent-v1', 'prompt-v1',
      'policy-v1', 'tools-v1', 'risk-v1', 'retrieval-v1', 'model-v1',
      replay_run_id_value, security_run_id_value, config_hash_value,
      repeat('3', 64), 'draft', now(), now()
    );
    RAISE EXCEPTION 'cross-tenant eval scope was not rejected';
  EXCEPTION
    WHEN foreign_key_violation OR check_violation THEN NULL;
  END;
END;
$$;

ROLLBACK;

\echo 'Phase 4D live release candidate verification passed'

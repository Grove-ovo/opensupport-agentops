import assert from 'node:assert/strict';
import { test } from 'node:test';
import type {
  AgentOpsStore,
  ApprovalActionCommand,
  OperationsService,
  Page,
  PageQuery,
  RedisCoordinator,
  ReleaseTransitionCommand,
  TenantRecord,
} from './contracts.js';
import { buildApp } from './app.js';
import { TestOperatorAccess } from './test-operator-access.js';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const TRACE_ID = '00000000-0000-4000-8000-000000000002';
const APPROVAL_ID = '00000000-0000-4000-8000-000000000003';
const CANDIDATE_ID = '00000000-0000-4000-8000-000000000004';
const POLICY_VERSION_ID = '00000000-0000-4000-8000-000000000005';

test('operations routes enforce confirmation and preserve action commands', async () => {
  const operations = new FakeOperations();
  const app = buildApp({
    store: new FakeStore(),
    redis: new FakeRedis(),
    operations,
    requiredMigration: 15,
    dedupeTtlSeconds: 86_400,
    buildVersion: 'test',
    operatorAccess: new TestOperatorAccess(),
    closeDependencies: false,
  });
  test.after(() => app.close());

  const overview = await app.inject({
    method: 'GET',
    url: `/api/v1/tenants/${TENANT_ID}/overview`,
  });
  assert.equal(overview.statusCode, 200);
  assert.equal(overview.json().approval_backlog, 2);

  const unconfirmed = await app.inject({
    method: 'POST',
    url: `/api/v1/tenants/${TENANT_ID}/approvals/${APPROVAL_ID}/actions`,
    payload: {
      action: 'approve',
      idempotency_key: 'approval-1',
      confirm: false,
    },
    headers: { 'x-csrf-token': 'test-csrf' },
  });
  assert.equal(unconfirmed.statusCode, 400);

  const missingCsrf = await app.inject({
    method: 'POST',
    url: `/api/v1/tenants/${TENANT_ID}/approvals/${APPROVAL_ID}/actions`,
    payload: {
      action: 'approve',
      idempotency_key: 'approval-missing-csrf',
      confirm: true,
    },
  });
  assert.equal(missingCsrf.statusCode, 403);

  const forgedActor = await app.inject({
    method: 'POST',
    url: `/api/v1/tenants/${TENANT_ID}/approvals/${APPROVAL_ID}/actions`,
    headers: { 'x-csrf-token': 'test-csrf' },
    payload: {
      action: 'approve',
      actor_id: 'forged-browser-identity',
      idempotency_key: 'approval-forged',
      confirm: true,
    },
  });
  assert.equal(forgedActor.statusCode, 403);

  const approved = await app.inject({
    method: 'POST',
    url: `/api/v1/tenants/${TENANT_ID}/approvals/${APPROVAL_ID}/actions`,
    payload: {
      action: 'edit',
      edited_reply: 'Edited public reply',
      idempotency_key: 'approval-2',
      confirm: true,
    },
    headers: { 'x-csrf-token': 'test-csrf' },
  });
  assert.equal(approved.statusCode, 200);
  assert.deepEqual(operations.approvalCommand, {
    tenantId: TENANT_ID,
    approvalId: APPROVAL_ID,
    action: 'edit',
    actorId: 'oidc:test-operator',
    editedReply: 'Edited public reply',
    idempotencyKey: 'approval-2',
  });

  const transitioned = await app.inject({
    method: 'POST',
    url: `/api/v1/tenants/${TENANT_ID}/releases/${CANDIDATE_ID}/transitions`,
    payload: {
      action: 'start_evaluation',
      idempotency_key: 'release-1',
      confirm: true,
    },
    headers: { 'x-csrf-token': 'test-csrf' },
  });
  assert.equal(transitioned.statusCode, 200);
  assert.equal(operations.releaseCommand?.action, 'start_evaluation');
});

test('policy KB routes list versions, documents, create, publish, and smoke test', async () => {
  const operations = new FakeOperations();
  const app = buildApp({
    store: new FakeStore(),
    redis: new FakeRedis(),
    operations,
    requiredMigration: 15,
    dedupeTtlSeconds: 86_400,
    buildVersion: 'test',
    operatorAccess: new TestOperatorAccess(),
    closeDependencies: false,
  });
  test.after(() => app.close());

  const versions = await app.inject({
    method: 'GET',
    url: `/api/v1/tenants/${TENANT_ID}/policy-versions`,
  });
  assert.equal(versions.statusCode, 200);
  assert.equal(versions.json().length, 1);
  assert.equal(versions.json()[0].status, 'draft');

  const documents = await app.inject({
    method: 'GET',
    url: `/api/v1/tenants/${TENANT_ID}/policy-versions/${POLICY_VERSION_ID}/documents`,
  });
  assert.equal(documents.statusCode, 200);
  assert.equal(documents.json().length, 1);
  assert.equal(documents.json()[0].source_key, 'returns.md');

  const created = await app.inject({
    method: 'POST',
    url: `/api/v1/tenants/${TENANT_ID}/policy-versions`,
    payload: {
      name: 'Refund policy',
      documents: [
        { source_key: 'refunds.md', title: 'Refund policy', content: 'Refunds within 14 days.' },
      ],
    },
    headers: { 'x-csrf-token': 'test-csrf' },
  });
  assert.equal(created.statusCode, 200);
  assert.equal(created.json().status, 'draft');
  assert.deepEqual(operations.createPolicyVersionInput, {
    name: 'Refund policy',
    documents: [{ source_key: 'refunds.md', title: 'Refund policy', content: 'Refunds within 14 days.' }],
    actorId: 'oidc:test-operator',
  });

  const published = await app.inject({
    method: 'PUT',
    url: `/api/v1/tenants/${TENANT_ID}/policy-versions/${POLICY_VERSION_ID}/publish`,
    headers: { 'x-csrf-token': 'test-csrf' },
  });
  assert.equal(published.statusCode, 200);
  assert.equal(published.json().status, 'published');
  assert.deepEqual(operations.publishPolicyVersionInput, {
    tenantId: TENANT_ID,
    policyVersionId: POLICY_VERSION_ID,
    actorId: 'oidc:test-operator',
  });

  const smoke = await app.inject({
    method: 'POST',
    url: `/api/v1/tenants/${TENANT_ID}/policy-retrieval-smoke-test`,
    payload: { query: 'return window' },
    headers: { 'x-csrf-token': 'test-csrf' },
  });
  assert.equal(smoke.statusCode, 200);
  assert.equal(smoke.json().length, 1);
  assert.equal(smoke.json()[0].score, 0.85);
  assert.deepEqual(operations.smokeTestInput, {
    tenantId: TENANT_ID,
    query: 'return window',
  });
});

class FakeOperations implements OperationsService {
  approvalCommand: ApprovalActionCommand | null = null;
  releaseCommand: ReleaseTransitionCommand | null = null;

  async getOverview() {
    return {
      active_conversations: 14,
      auto_rate: 62.5,
      approval_backlog: 2,
      p95_latency_ms: 812,
      daily_cost: 0.38,
      failure_count: 1,
      workload: [],
    };
  }

  async getTrace() {
    return null;
  }

  async applyApprovalAction(command: ApprovalActionCommand) {
    this.approvalCommand = command;
    return approvalRecord(command.action === 'edit' ? 'edited' : 'approved');
  }

  async getRelease() {
    return releaseRecord('draft');
  }

  async transitionRelease(command: ReleaseTransitionCommand) {
    this.releaseCommand = command;
    return releaseRecord('evaluating');
  }

  async getSettings() {
    return {
      tenant: tenantRecord(),
      model_config: null,
      chatwoot: null,
    };
  }

  async updateTenant() {
    return tenantRecord();
  }

  async updateModelConfig(): Promise<never> {
    throw new Error('not used');
  }

  async updateChatwoot(): Promise<never> {
    throw new Error('not used');
  }

  async getPolicyVersions() {
    return [
      {
        id: POLICY_VERSION_ID,
        tenant_id: TENANT_ID,
        version: 1,
        name: 'Returns policy',
        status: 'draft' as const,
        content_hash: 'a'.repeat(64),
        document_count: 1,
        chunk_count: 3,
        published_at: null,
        created_at: '2026-06-23T00:00:00.000Z',
      },
    ];
  }

  async getPolicyDocuments() {
    return [
      {
        id: '00000000-0000-4000-8000-000000000006',
        tenant_id: TENANT_ID,
        policy_version_id: POLICY_VERSION_ID,
        source_key: 'returns.md',
        title: 'Returns policy',
        media_type: 'text/plain',
        content_hash: 'b'.repeat(64),
        chunk_count: 3,
        created_at: '2026-06-23T00:00:00.000Z',
      },
    ];
  }

  createPolicyVersionInput: { name: string; documents: unknown[]; actorId: string } | null = null;

  async createPolicyVersion(
    tenantId: string,
    input: { name: string; documents: ReadonlyArray<unknown>; actorId: string },
  ) {
    this.createPolicyVersionInput = { ...input, documents: [...input.documents] };
    return {
      id: POLICY_VERSION_ID,
      tenant_id: tenantId,
      version: 1,
      name: input.name,
      status: 'draft' as const,
      content_hash: 'a'.repeat(64),
      document_count: input.documents.length,
      chunk_count: 3,
      published_at: null,
      created_at: '2026-06-23T00:00:00.000Z',
    };
  }

  publishPolicyVersionInput: { tenantId: string; policyVersionId: string; actorId: string } | null = null;

  async publishPolicyVersion(
    tenantId: string,
    policyVersionId: string,
    actorId: string,
  ) {
    this.publishPolicyVersionInput = { tenantId, policyVersionId, actorId };
    return {
      id: policyVersionId,
      tenant_id: tenantId,
      version: 1,
      name: 'Returns policy',
      status: 'published' as const,
      content_hash: 'a'.repeat(64),
      document_count: 1,
      chunk_count: 3,
      published_at: '2026-06-23T00:00:00.000Z',
      created_at: '2026-06-23T00:00:00.000Z',
    };
  }

  smokeTestInput: { tenantId: string; query: string; limit?: number } | null = null;

  async runRetrievalSmokeTest(
    tenantId: string,
    input: { query: string; limit?: number },
  ) {
    this.smokeTestInput = { tenantId, ...input };
    return [
      {
        chunk_id: '00000000-0000-4000-8000-000000000007',
        document_id: '00000000-0000-4000-8000-000000000006',
        chunk_index: 0,
        content: 'Returns are accepted within 30 days.',
        content_hash: 'c'.repeat(64),
        score: 0.85,
      },
    ];
  }
}

class FakeStore implements AgentOpsStore {
  async ping(): Promise<void> {}
  async close(): Promise<void> {}
  async getMigrationVersion(): Promise<number> {
    return 15;
  }
  async listTenants(query: PageQuery): Promise<Page<TenantRecord>> {
    return { items: [tenantRecord()], total: 1, ...query };
  }
  async listTenantsByIds(
    tenantIds: readonly string[],
    query: PageQuery,
  ): Promise<Page<TenantRecord>> {
    const tenant = tenantRecord();
    const items = tenantIds.includes(tenant.id) ? [tenant] : [];
    return { items, total: items.length, ...query };
  }
  async getTenant() {
    return tenantRecord();
  }
  async getActiveModelConfig() {
    return null;
  }
  async listTraces(_tenantId: string, query: PageQuery): Promise<Page<never>> {
    return { items: [], total: 0, ...query };
  }
  async listApprovals(
    _tenantId: string,
    _state: null,
    query: PageQuery,
  ): Promise<Page<never>> {
    return { items: [], total: 0, ...query };
  }
  async listReleaseCandidates(
    _tenantId: string,
    _state: null,
    query: PageQuery,
  ): Promise<Page<never>> {
    return { items: [], total: 0, ...query };
  }
  async createOrGetCanonicalEvent(): Promise<never> {
    throw new Error('not used');
  }
}

class FakeRedis implements RedisCoordinator {
  async ping(): Promise<void> {}
  async close(): Promise<void> {}
  async claimDedupeKeys(): Promise<boolean> {
    return true;
  }
  async acquireLock(): Promise<null> {
    return null;
  }
}

function tenantRecord(): TenantRecord {
  return {
    id: TENANT_ID,
    slug: 'tenant',
    display_name: 'Tenant',
    status: 'active',
    metadata: {},
    created_at: '2026-06-21T00:00:00.000Z',
    updated_at: '2026-06-21T00:00:00.000Z',
  };
}

function approvalRecord(state: 'approved' | 'edited') {
  return {
    approval_id: APPROVAL_ID,
    tenant_id: TENANT_ID,
    trace_id: TRACE_ID,
    state,
    suggested_reply: 'Reply',
    evidence_refs: ['policy-1'],
    tool_result_refs: [],
    risk_reason: 'human_review',
    expires_at: '2026-06-22T00:00:00.000Z',
    approver_action: state,
    approver_id: 'operator',
    edited_reply: state === 'edited' ? 'Edited public reply' : null,
    edit_distance: state === 'edited' ? 10 : null,
    action_at: '2026-06-21T00:01:00.000Z',
    created_at: '2026-06-21T00:00:00.000Z',
  };
}

function releaseRecord(state: 'draft' | 'evaluating') {
  return {
    candidate_id: CANDIDATE_ID,
    tenant_id: TENANT_ID,
    state,
    agent_version_id: 'agent-v1',
    prompt_version_id: 'prompt-v1',
    policy_version_id: 'policy-v1',
    model_config_version_id: 'model-v1',
    replay_eval_run_id: TRACE_ID,
    security_eval_run_id: APPROVAL_ID,
    snapshot_hash: 'a'.repeat(64),
    created_at: '2026-06-21T00:00:00.000Z',
    updated_at: '2026-06-21T00:00:00.000Z',
    transitions: [],
    gate_result: null,
    gate_decisions: [],
  };
}

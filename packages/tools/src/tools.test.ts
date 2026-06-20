import assert from 'node:assert/strict';
import test from 'node:test';
import type { ToolCallRequest, ToolName } from '@opensupport/shared';
import {
  MockBusinessRepository,
  TOOL_MANIFEST_VERSION_ID,
  ToolExecutor,
} from './index.js';

const tenantId = '018f7f4a-7c1d-7b22-8d41-1234567890aa';
const otherTenantId = '018f7f4a-7c1d-7b22-8d41-1234567890ab';
const traceId = '018f7f4a-7c1d-7b22-8d41-1234567890ac';
const now = '2026-06-19T10:00:00.000Z';

test('executes all deterministic mock business tools', async () => {
  const executor = createExecutor();
  const cases: readonly [ToolName, Record<string, unknown>, string][] = [
    ['get_order_status', { order_id: 'ORDER-1' }, 'order:read'],
    ['get_logistics_status', { order_id: 'ORDER-1' }, 'logistics:read'],
    ['check_refund_eligibility', { order_id: 'ORDER-1' }, 'refund:read'],
    [
      'create_refund_request_dry_run',
      { order_id: 'ORDER-1', reason: 'Damaged item' },
      'refund:dry_run',
    ],
    ['escalate_to_human', { reason: 'Customer complaint' }, 'handoff:create'],
  ];

  for (const [toolName, args, permission] of cases) {
    const result = await executor.execute(
      request(toolName, args, permission),
      { now },
    );
    assert.equal(result.code, 'ok');
    assert.equal(result.status, 'succeeded');
    assert.match(result.result_id, /^tool-result:[a-f0-9]{32}$/u);
    assert.match(result.audit.input_hash, /^[a-f0-9]{64}$/u);
    assert.equal(JSON.stringify(result.audit).includes('Damaged item'), false);
  }
});

test('rejects invalid schema, permission, ownership, and missing orders', async () => {
  const executor = createExecutor();
  const invalid = await executor.execute(
    request('get_order_status', { bad: 'field' }, 'order:read'),
    { now },
  );
  assert.equal(invalid.code, 'invalid_schema');

  const denied = await executor.execute(
    request('get_order_status', { order_id: 'ORDER-1' }, 'wrong'),
    { now },
  );
  assert.equal(denied.code, 'permission_denied');

  const unauthorized = await executor.execute(
    request('get_order_status', { order_id: 'ORDER-OTHER' }, 'order:read'),
    { now },
  );
  assert.equal(unauthorized.code, 'unauthorized_order');

  const missing = await executor.execute(
    request('get_order_status', { order_id: 'MISSING' }, 'order:read'),
    { now },
  );
  assert.equal(missing.code, 'not_found');
});

test('returns stable timeout and retryable codes', async () => {
  const executor = createExecutor({
    get_order_status: 2000,
  });
  const timedOut = await executor.execute(
    request('get_order_status', { order_id: 'ORDER-1' }, 'order:read'),
    { now },
  );
  assert.equal(timedOut.code, 'timed_out');

  const retryable = await createExecutor().execute(
    request('get_order_status', { order_id: 'ORDER-RETRY' }, 'order:read'),
    { now },
  );
  assert.equal(retryable.code, 'retryable_error');
  assert.equal(retryable.retryable, true);
});

test('returns the existing dry-run result for duplicate refund requests', async () => {
  const executor = createExecutor();
  const firstRequest = request(
    'create_refund_request_dry_run',
    { order_id: 'ORDER-1', reason: 'Damaged item' },
    'refund:dry_run',
  );
  const first = await executor.execute(firstRequest, { now });
  const duplicate = await executor.execute(
    {
      ...firstRequest,
      call_id: '018f7f4a-7c1d-7b22-8d41-1234567890ef',
    },
    { now },
  );

  assert.equal(first.code, 'ok');
  assert.equal(duplicate.code, 'duplicate_request');
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(duplicate.result_id, first.result_id);
  assert.deepEqual(duplicate.data, first.data);
  assert.equal(
    (duplicate.data as { external_side_effect: boolean }).external_side_effect,
    false,
  );
});

test('rejects idempotency reuse with different arguments and manifest versions', async () => {
  const executor = createExecutor();
  const first = request(
    'create_refund_request_dry_run',
    { order_id: 'ORDER-1', reason: 'Damaged item' },
    'refund:dry_run',
  );
  await executor.execute(first, { now });
  const conflict = await executor.execute(
    {
      ...first,
      call_id: '018f7f4a-7c1d-7b22-8d41-1234567890ee',
      arguments: { order_id: 'ORDER-1', reason: 'Changed reason' },
    },
    { now },
  );
  assert.equal(conflict.code, 'idempotency_conflict');

  const versionMismatch = await executor.execute(
    {
      ...request('get_order_status', { order_id: 'ORDER-1' }, 'order:read'),
      tool_manifest_version_id: 'tools-v2',
    },
    { now },
  );
  assert.equal(versionMismatch.code, 'manifest_version_mismatch');
});

function createExecutor(latencyByTool: Readonly<Record<string, number>> = {}) {
  return new ToolExecutor(
    new MockBusinessRepository(
      [
        {
          tenant_id: tenantId,
          contact_id: 'contact-1',
          order_id: 'ORDER-1',
          order_status: 'shipped',
          logistics_status: 'in_transit',
          tracking_number: 'TRACK-1',
          refund_eligible: true,
          refund_reason: 'Within return window',
        },
        {
          tenant_id: otherTenantId,
          contact_id: 'contact-2',
          order_id: 'ORDER-OTHER',
          order_status: 'delivered',
          logistics_status: 'delivered',
          tracking_number: 'TRACK-OTHER',
          refund_eligible: false,
          refund_reason: 'Outside return window',
        },
        {
          tenant_id: tenantId,
          contact_id: 'contact-1',
          order_id: 'ORDER-RETRY',
          order_status: 'processing',
          logistics_status: 'not_shipped',
          tracking_number: null,
          refund_eligible: true,
          refund_reason: null,
          failure_mode: 'retryable',
        },
      ],
      latencyByTool,
    ),
  );
}

function request(
  toolName: ToolName,
  args: Record<string, unknown>,
  permission: string,
): ToolCallRequest {
  return {
    call_id: '018f7f4a-7c1d-7b22-8d41-1234567890ad',
    trace_id: traceId,
    tenant_id: tenantId,
    contact_id: 'contact-1',
    tool_name: toolName,
    tool_manifest_version_id: TOOL_MANIFEST_VERSION_ID,
    idempotency_key: `${toolName}:request-1`,
    arguments: args,
    permissions: [permission],
    deadline_at: '2026-06-19T10:00:10.000Z',
  };
}

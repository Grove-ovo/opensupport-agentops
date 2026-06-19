import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import type { ChatwootDeliveryCommand } from '@opensupport/shared';
import {
  ChatwootDeliveryService,
  ChatwootTransportError,
  type ChatwootTransport,
  type ChatwootTransportRequest,
} from './delivery.js';

const tenantId = '018f7f4a-7c1d-7b22-8d41-1234567890aa';
const traceId = '018f7f4a-7c1d-7b22-8d41-1234567890ab';
const connection = {
  tenant_id: tenantId,
  base_url: 'https://chatwoot.example.com/',
  account_id: 42,
  api_token_ref: 'secret://tenant/chatwoot-token',
};

test('maps private notes and public replies to Chatwoot payloads', async () => {
  const transport = new FakeTransport();
  const service = createService(transport);
  await service.deliver(command('private_note', 'private-key'), connection, now);
  await service.deliver(command('public_reply', 'public-key'), connection, now);

  assert.equal(transport.requests[0]?.body.private, true);
  assert.equal(transport.requests[1]?.body.private, false);
  assert.equal(transport.requests[0]?.body.message_type, 'outgoing');
  assert.equal(
    transport.requests[0]?.url,
    'https://chatwoot.example.com/api/v1/accounts/42/conversations/1001/messages',
  );
  assert.equal(transport.requests[0]?.headers.api_access_token, 'plaintext-token');
});

test('deduplicates concurrent commands before calling Chatwoot', async () => {
  const transport = new FakeTransport();
  const service = createService(transport);
  const input = command('public_reply', 'same-key');
  const [first, second] = await Promise.all([
    service.deliver(input, connection, now),
    service.deliver(input, connection, now),
  ]);

  assert.equal(transport.requests.length, 1);
  assert.equal(first.status, 'succeeded');
  assert.equal(second.status, 'duplicate');
  assert.equal(second.code, 'duplicate_delivery');
});

test('deduplicates a semantic retry with a new delivery id and deadline', async () => {
  const transport = new FakeTransport();
  const service = createService(transport);
  const first = command('public_reply', 'semantic-retry');
  await service.deliver(first, connection, now);
  const retry = {
    ...first,
    delivery_id: '018f7f4a-7c1d-7b22-8d41-1234567890ad',
    deadline_at: '2026-06-19T00:02:00.000Z',
  };
  const result = await service.deliver(retry, connection, now);
  assert.equal(result.status, 'duplicate');
  assert.equal(transport.requests.length, 1);
});

test('rejects idempotency reuse with changed content', async () => {
  const service = createService(new FakeTransport());
  await service.deliver(command('public_reply', 'conflict'), connection, now);
  const changed = command('public_reply', 'conflict', 'Changed reply');
  const result = await service.deliver(changed, connection, now);
  assert.equal(result.code, 'idempotency_conflict');
});

test('returns stable validation, scope, auth, timeout, and retryable codes', async () => {
  const service = createService(new FakeTransport());
  const invalid = { ...command('public_reply', 'invalid'), content_hash: '0'.repeat(64) };
  assert.equal(
    (await service.deliver(invalid, connection, now)).code,
    'content_hash_mismatch',
  );
  assert.equal(
    (
      await service.deliver(command('public_reply', 'scope'), {
        ...connection,
        tenant_id: traceId,
      }, now)
    ).code,
    'scope_mismatch',
  );

  for (const [status, code] of [[403, 'auth_failed'], [503, 'retryable_error']] as const) {
    const transport = new FakeTransport(status);
    assert.equal(
      (await createService(transport).deliver(command('public_reply', `s-${status}`), connection, now)).code,
      code,
    );
  }
  const timeout = new FakeTransport(200, 'timed_out');
  assert.equal(
    (await createService(timeout).deliver(command('public_reply', 'timeout'), connection, now)).code,
    'timed_out',
  );
});

test('keeps credentials out of receipts and audit records', async () => {
  const result = await createService(new FakeTransport()).deliver(
    command('public_reply', 'audit'),
    connection,
    now,
  );
  assert.equal(result.tenant_id, tenantId);
  assert.equal(result.trace_id, traceId);
  assert.equal(JSON.stringify(result).includes('plaintext-token'), false);
  assert.match(result.audit.credential_ref_hash ?? '', /^[a-f0-9]{64}$/);
});

class FakeTransport implements ChatwootTransport {
  readonly requests: ChatwootTransportRequest[] = [];

  constructor(
    readonly status = 200,
    readonly error?: 'timed_out' | 'retryable_error',
  ) {}

  async send(request: ChatwootTransportRequest) {
    this.requests.push(request);
    if (this.error) throw new ChatwootTransportError(this.error);
    return { status: this.status, body: { id: 9001 } };
  }
}

function createService(transport: ChatwootTransport) {
  return new ChatwootDeliveryService(transport, {
    resolve(reference, scopedTenantId) {
      assert.equal(reference, connection.api_token_ref);
      assert.equal(scopedTenantId, tenantId);
      return 'plaintext-token';
    },
  });
}

function command(
  messageType: 'private_note' | 'public_reply',
  idempotencyKey: string,
  content = 'Order update',
): ChatwootDeliveryCommand {
  return {
    delivery_id: '018f7f4a-7c1d-7b22-8d41-1234567890ac',
    tenant_id: tenantId,
    trace_id: traceId,
    conversation_id: '1001',
    message_type: messageType,
    content,
    content_hash: createHash('sha256').update(content).digest('hex'),
    idempotency_key: idempotencyKey,
    deadline_at: '2026-06-19T00:01:00.000Z',
  };
}

const now = '2026-06-19T00:00:00.000Z';

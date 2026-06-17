import { createHmac } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MemoryDedupeStore,
  handleAccountWebhookEndpoint,
  handleAgentBotEndpoint,
  verifyChatwootSignature,
} from './index.js';

const tenantId = 'tenant_a';
const secret = 'webhook-secret';

test('verifies Chatwoot HMAC signature using timestamp and raw body', () => {
  const rawBody = JSON.stringify(messageCreatedPayload());
  const timestamp = '1720000000';
  const signature = sign(timestamp, rawBody, secret);

  const result = verifyChatwootSignature({
    headers: {
      'x-chatwoot-timestamp': timestamp,
      'x-chatwoot-signature': signature,
    },
    rawBody,
    secret,
  });

  assert.equal(result.configured, true);
  assert.equal(result.verified, true);
});

test('rejects invalid webhook signatures', async () => {
  const rawBody = JSON.stringify(messageCreatedPayload());

  const response = await handleAccountWebhookEndpoint({
    tenantId,
    headers: {
      'x-chatwoot-timestamp': '1720000000',
      'x-chatwoot-signature': 'sha256=bad',
    },
    rawBody,
    webhookSecret: secret,
  });

  assert.equal(response.status, 401);
  assert.equal(response.body.reason_code, 'invalid_signature');
  assert.equal(response.body.should_seed_pipeline, false);
});

test('dedupes the same customer message across Agent Bot and webhook paths', async () => {
  const store = new MemoryDedupeStore();
  const payload = messageCreatedPayload();
  const rawBody = JSON.stringify(payload);
  const timestamp = '1720000000';

  const agentBotResponse = await handleAgentBotEndpoint(
    {
      tenantId,
      headers: {},
      rawBody,
    },
    { dedupeStore: store },
  );
  const webhookResponse = await handleAccountWebhookEndpoint(
    {
      tenantId,
      headers: {
        'x-chatwoot-timestamp': timestamp,
        'x-chatwoot-signature': sign(timestamp, rawBody, secret),
        'x-chatwoot-delivery': 'delivery-1',
      },
      rawBody,
      webhookSecret: secret,
    },
    { dedupeStore: store },
  );

  assert.equal(agentBotResponse.body.decision, 'pipeline_seeded');
  assert.equal(agentBotResponse.body.should_seed_pipeline, true);
  assert.equal(webhookResponse.body.decision, 'duplicate');
  assert.equal(webhookResponse.body.should_seed_pipeline, false);
  assert.equal(webhookResponse.body.dedupe_key, `${tenantId}:42:100:message_created`);
});

test('dedupes repeated webhook deliveries by Chatwoot delivery id', async () => {
  const store = new MemoryDedupeStore();
  const rawBody = JSON.stringify(messageCreatedPayload({ id: 101 }));
  const timestamp = '1720000000';
  const headers = {
    'x-chatwoot-timestamp': timestamp,
    'x-chatwoot-signature': sign(timestamp, rawBody, secret),
    'x-chatwoot-delivery': 'delivery-repeat',
  };
  const request = {
    tenantId,
    headers,
    rawBody,
    webhookSecret: secret,
  };

  const firstResponse = await handleAccountWebhookEndpoint(request, { dedupeStore: store });
  const secondResponse = await handleAccountWebhookEndpoint(request, { dedupeStore: store });

  assert.equal(firstResponse.body.decision, 'pipeline_seeded');
  assert.equal(secondResponse.body.decision, 'duplicate');
  assert.equal(secondResponse.body.should_seed_pipeline, false);
});

test('ignores AgentOps self-created outgoing messages', async () => {
  const response = await handleAccountWebhookEndpoint({
    tenantId,
    headers: {},
    rawBody: JSON.stringify(messageCreatedPayload({
      message_type: 'outgoing',
      sender: { id: 7 },
      content_attributes: { agentops_generated: true },
    })),
    agentopsActorIds: ['7'],
  });

  assert.equal(response.status, 202);
  assert.equal(response.body.decision, 'audit_only');
  assert.equal(response.body.reason_code, 'self_outgoing_message');
  assert.equal(response.body.should_seed_pipeline, false);
  assert.equal(response.body.canonical_event?.is_self_outgoing, true);
});

test('preserves raw payload hash for audit responses', async () => {
  const rawBody = JSON.stringify(messageCreatedPayload({ private: true }));
  const response = await handleAccountWebhookEndpoint({
    tenantId,
    headers: {},
    rawBody,
  });

  assert.equal(response.body.decision, 'audit_only');
  assert.match(response.body.payload_hash ?? '', /^[a-f0-9]{64}$/);
  assert.equal(response.body.canonical_event?.payload_hash, response.body.payload_hash);
});

function sign(timestamp: string, rawBody: string, signingSecret: string): string {
  const hmac = createHmac('sha256', signingSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  return `sha256=${hmac}`;
}

function messageCreatedPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    event: 'message_created',
    id: 100,
    message_type: 'incoming',
    private: false,
    conversation: { id: 42 },
    sender: { id: 5, type: 'contact' },
    content: 'Where is my order?',
    ...overrides,
  };
}

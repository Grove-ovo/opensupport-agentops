import { MemoryDedupeStore, claimDedupeKeys } from './dedupe.js';
import { normalizeChatwootEvent, parseJsonBody } from './payload.js';
import { verifyChatwootSignature } from './signature.js';
import type {
  ChatwootEndpointOptions,
  ChatwootEndpointRequest,
  ChatwootEndpointResponse,
} from './types.js';

const defaultDedupeStore = new MemoryDedupeStore();

export async function handleAgentBotEndpoint(
  request: ChatwootEndpointRequest,
  options: ChatwootEndpointOptions = {},
): Promise<ChatwootEndpointResponse> {
  return handleChatwootEndpoint('agent_bot', request, options);
}

export async function handleAccountWebhookEndpoint(
  request: ChatwootEndpointRequest,
  options: ChatwootEndpointOptions = {},
): Promise<ChatwootEndpointResponse> {
  return handleChatwootEndpoint('account_webhook', request, options);
}

async function handleChatwootEndpoint(
  source: 'agent_bot' | 'account_webhook',
  request: ChatwootEndpointRequest,
  options: ChatwootEndpointOptions,
): Promise<ChatwootEndpointResponse> {
  const signature = verifyChatwootSignature({
    headers: request.headers,
    rawBody: request.rawBody,
    secret: request.webhookSecret,
  });

  if (!signature.configured) {
    return {
      status: 503,
      body: {
        accepted: false,
        decision: 'rejected',
        reason_code: 'webhook_signature_not_configured',
        should_seed_pipeline: false,
      },
    };
  }

  if (!signature.verified) {
    return {
      status: 401,
      body: {
        accepted: false,
        decision: 'rejected',
        reason_code: 'invalid_signature',
        should_seed_pipeline: false,
      },
    };
  }

  let payload: unknown;

  try {
    payload = request.parsedBody ?? parseJsonBody(request.rawBody);
  } catch {
    return {
      status: 400,
      body: {
        accepted: false,
        decision: 'rejected',
        reason_code: 'invalid_payload',
        should_seed_pipeline: false,
      },
    };
  }

  const normalized = normalizeChatwootEvent({
    tenantId: request.tenantId,
    source,
    payload,
    rawBody: request.rawBody,
    headers: request.headers,
    agentopsActorIds: request.agentopsActorIds,
    agentopsMessageSignatures: request.agentopsMessageSignatures,
  });

  if (!normalized.canonicalEvent) {
    return {
      status: 202,
      body: {
        accepted: true,
        decision: 'audit_only',
        reason_code: normalized.reasonCode,
        should_seed_pipeline: false,
        payload_hash: normalized.payloadHash,
      },
    };
  }

  if (!normalized.canonicalEvent.is_customer_message || normalized.canonicalEvent.is_self_outgoing) {
    return {
      status: 202,
      body: {
        accepted: true,
        decision: 'audit_only',
        reason_code: normalized.reasonCode,
        should_seed_pipeline: false,
        dedupe_key: normalized.canonicalEvent.dedupe_key,
        payload_hash: normalized.payloadHash,
        canonical_event: normalized.canonicalEvent,
      },
    };
  }

  const dedupeKeys = normalized.deliveryDedupeKey
    ? [normalized.deliveryDedupeKey, normalized.canonicalEvent.dedupe_key]
    : [normalized.canonicalEvent.dedupe_key];
  const dedupeStore = options.dedupeStore ?? defaultDedupeStore;
  const claimed = await claimDedupeKeys(dedupeStore, dedupeKeys);

  if (!claimed) {
    return {
      status: 202,
      body: {
        accepted: true,
        decision: 'duplicate',
        reason_code: 'duplicate_delivery',
        should_seed_pipeline: false,
        dedupe_key: normalized.canonicalEvent.dedupe_key,
        payload_hash: normalized.payloadHash,
        canonical_event: normalized.canonicalEvent,
      },
    };
  }

  return {
    status: 202,
    body: {
      accepted: true,
      decision: 'pipeline_seeded',
      reason_code: 'canonical_customer_message',
      should_seed_pipeline: true,
      dedupe_key: normalized.canonicalEvent.dedupe_key,
      payload_hash: normalized.payloadHash,
      canonical_event: normalized.canonicalEvent,
    },
  };
}

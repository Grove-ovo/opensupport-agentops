import { createHash } from 'node:crypto';
import { getHeader } from './headers.js';
import type { CanonicalInboundEvent } from '@opensupport/shared';
import type {
  ChatwootReasonCode,
  NormalizationOptions,
  NormalizedChatwootEvent,
} from './types.js';

type JsonObject = Record<string, unknown>;

export function parseJsonBody(rawBody: string | Buffer): unknown {
  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;

  if (body.trim().length === 0) {
    throw new Error('Request body is empty');
  }

  return JSON.parse(body);
}

export function normalizeChatwootEvent(options: NormalizationOptions): NormalizedChatwootEvent {
  const payloadHash = hashPayload(options.rawBody);
  const payload = asObject(options.payload);

  if (!payload) {
    return { payloadHash, reasonCode: 'invalid_payload' };
  }

  const eventType = getEventType(payload, options.source);
  const message = getMessageObject(payload);
  const conversation = getConversationObject(payload, message);
  const conversationId = firstString(
    getPath(payload, ['conversation_id']),
    getPath(conversation, ['id']),
    getPath(message, ['conversation_id']),
    getPath(message, ['conversation', 'id']),
  );
  const messageId = firstString(
    getPath(payload, ['message_id']),
    getPath(message, ['id']),
    getPath(payload, ['id']),
  );

  if (!conversationId || !messageId) {
    return { payloadHash, reasonCode: 'missing_message_identity' };
  }

  const isSelfOutgoing = isAgentOpsOutgoingMessage(message, options);
  const isCustomerMessage = isIncomingCustomerMessage(eventType, message) && !isSelfOutgoing;
  const dedupeKey = buildCanonicalDedupeKey(options.tenantId, conversationId, messageId, eventType);
  const deliveryId = getHeader(options.headers, 'x-chatwoot-delivery');
  const canonicalEvent: CanonicalInboundEvent = {
    tenant_id: options.tenantId,
    source: options.source,
    conversation_id: conversationId,
    message_id: messageId,
    event_type: eventType,
    dedupe_key: dedupeKey,
    payload_hash: payloadHash,
    is_customer_message: isCustomerMessage,
    is_self_outgoing: isSelfOutgoing,
  };
  const reasonCode: ChatwootReasonCode = isSelfOutgoing
    ? 'self_outgoing_message'
    : isCustomerMessage
      ? 'canonical_customer_message'
      : 'non_customer_message';

  const normalized: NormalizedChatwootEvent = {
    canonicalEvent,
    payloadHash,
    reasonCode,
  };

  if (deliveryId) {
    normalized.deliveryDedupeKey = `chatwoot_delivery:${options.tenantId}:${deliveryId}`;
  }

  return normalized;
}

export function buildCanonicalDedupeKey(
  tenantId: string,
  conversationId: string,
  messageId: string,
  eventType: string,
): string {
  return `${tenantId}:${conversationId}:${messageId}:${eventType}`;
}

function hashPayload(rawBody: string | Buffer): string {
  return createHash('sha256').update(rawBody).digest('hex');
}

function getEventType(payload: JsonObject, source: string): string {
  const eventType = firstString(
    getPath(payload, ['event']),
    getPath(payload, ['event_type']),
    getPath(payload, ['webhook_event']),
    getPath(payload, ['name']),
  );

  if (eventType) {
    return eventType;
  }

  return source === 'agent_bot' ? 'message_created' : 'unknown';
}

function getMessageObject(payload: JsonObject): JsonObject {
  return (
    asObject(getPath(payload, ['message'])) ??
    asObject(getPath(payload, ['data', 'message'])) ??
    payload
  );
}

function getConversationObject(payload: JsonObject, message: JsonObject): JsonObject | undefined {
  return (
    asObject(getPath(payload, ['conversation'])) ??
    asObject(getPath(payload, ['data', 'conversation'])) ??
    asObject(getPath(message, ['conversation']))
  );
}

function isIncomingCustomerMessage(eventType: string, message: JsonObject): boolean {
  const messageType = getPath(message, ['message_type']);
  const privateMessage = getPath(message, ['private']);

  return (
    eventType === 'message_created' &&
    (messageType === 'incoming' || messageType === 0 || messageType === '0') &&
    privateMessage !== true
  );
}

function isAgentOpsOutgoingMessage(message: JsonObject, options: NormalizationOptions): boolean {
  const messageType = getPath(message, ['message_type']);
  const senderId = firstString(getPath(message, ['sender', 'id']), getPath(message, ['sender_id']));
  const actorIds = new Set(options.agentopsActorIds ?? []);
  const signatures = new Set(options.agentopsMessageSignatures ?? []);
  const outbound = messageType === 'outgoing' || messageType === 1 || messageType === '1';
  const messageSignature = firstString(
    getPath(message, ['source_id']),
    getPath(message, ['content_attributes', 'agentops_message_id']),
    getPath(message, ['additional_attributes', 'agentops_message_id']),
    getPath(message, ['external_source_ids', 'agentops']),
  );
  const generatedByAgentOps =
    getPath(message, ['content_attributes', 'agentops_generated']) === true ||
    getPath(message, ['additional_attributes', 'agentops_generated']) === true;

  return outbound && (
    generatedByAgentOps ||
    (senderId !== undefined && actorIds.has(senderId)) ||
    (messageSignature !== undefined && signatures.has(messageSignature))
  );
}

function asObject(value: unknown): JsonObject | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as JsonObject;
  }

  return undefined;
}

function getPath(object: JsonObject | undefined, path: readonly string[]): unknown {
  let cursor: unknown = object;

  for (const segment of path) {
    if (!asObject(cursor)) {
      return undefined;
    }

    cursor = asObject(cursor)?.[segment];
  }

  return cursor;
}

function firstString(...values: readonly unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }

  return undefined;
}

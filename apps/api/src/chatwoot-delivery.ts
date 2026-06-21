import { createHash } from 'node:crypto';
import {
  buildChatwootTransportRequest,
  FetchChatwootTransport,
  type ChatwootCredentialResolver,
} from '@opensupport/chatwoot';
import type {
  ChatwootDeliveryCode,
  ChatwootDeliveryCommand,
  ChatwootDeliveryReceipt,
} from '@opensupport/shared';
import type {
  ChatwootRuntimeConnection,
  ProductionE2ERepository,
} from './e2e-repository.js';

export class PersistentChatwootDeliveryService {
  readonly transport = new FetchChatwootTransport();

  constructor(
    readonly repository: ProductionE2ERepository,
    readonly secrets: ChatwootCredentialResolver,
  ) {}

  async deliver(
    command: ChatwootDeliveryCommand,
    connection: ChatwootRuntimeConnection,
  ): Promise<ChatwootDeliveryReceipt> {
    if (connection.api_token_ref === null) {
      return failureReceipt(command, 'credential_unavailable', null);
    }
    const credentialRefHash = hash(connection.api_token_ref);
    const inputHash = hashJson({
      tenant_id: command.tenant_id,
      trace_id: command.trace_id,
      conversation_id: command.conversation_id,
      message_type: command.message_type,
      content_hash: command.content_hash,
    });
    let token: string;
    try {
      token = await this.secrets.resolve(
        connection.api_token_ref,
        command.tenant_id,
      );
    } catch {
      return failureReceipt(command, 'credential_unavailable', credentialRefHash);
    }
    const request = buildChatwootTransportRequest(
      command,
      {
        tenant_id: connection.tenant_id,
        base_url: connection.base_url,
        account_id: connection.account_id,
        api_token_ref: connection.api_token_ref,
      },
      token,
    );
    const requestHash = hashJson({
      url: request.url,
      body: request.body,
      deadline_at: request.deadline_at,
    });
    const claim = await this.repository.claimDelivery({
      deliveryId: command.delivery_id,
      tenantId: command.tenant_id,
      traceId: command.trace_id,
      conversationId: command.conversation_id,
      messageType: command.message_type,
      idempotencyKey: command.idempotency_key,
      inputHash,
      credentialRefHash,
      requestHash,
    });
    if (claim.status === 'conflict') {
      return failureReceipt(command, 'idempotency_conflict', credentialRefHash);
    }
    const claimedCommand =
      claim.record.deliveryId === command.delivery_id
        ? command
        : { ...command, delivery_id: claim.record.deliveryId };
    if (claim.status === 'in_flight') {
      return failureReceipt(
        claimedCommand,
        'retryable_error',
        credentialRefHash,
      );
    }
    if (claim.status === 'duplicate') {
      return receipt(
        claimedCommand,
        'duplicate_delivery',
        claim.record.providerMessageId,
        credentialRefHash,
        claim.record.requestHash,
        claim.record.responseHash,
      );
    }

    try {
      const response = await this.transport.send(request);
      const code = mapStatus(response.status);
      const providerMessageId =
        code === 'ok' ? readProviderMessageId(response.body) : null;
      const effectiveCode =
        code === 'ok' && providerMessageId === null ? 'provider_error' : code;
      const responseHash = hashJson(response.body);
      await this.repository.completeDelivery(
        claim.record.deliveryId,
        effectiveCode === 'ok' ? 'succeeded' : 'failed',
        effectiveCode,
        providerMessageId,
        responseHash,
      );
      return receipt(
        claimedCommand,
        effectiveCode,
        providerMessageId,
        credentialRefHash,
        requestHash,
        responseHash,
      );
    } catch {
      await this.repository.completeDelivery(
        claim.record.deliveryId,
        'failed',
        'retryable_error',
        null,
        null,
      );
      return receipt(
        claimedCommand,
        'retryable_error',
        null,
        credentialRefHash,
        requestHash,
        null,
      );
    }
  }
}

export class ChatwootConversationService {
  constructor(readonly secrets: ChatwootCredentialResolver) {}

  async handoff(
    connection: ChatwootRuntimeConnection,
    conversationId: string,
    deadlineAt: string,
  ): Promise<void> {
    if (connection.api_token_ref === null) {
      throw new Error('Chatwoot API token is unavailable');
    }
    const token = await this.secrets.resolve(
      connection.api_token_ref,
      connection.tenant_id,
    );
    if (connection.assignee_id !== null || connection.team_id !== null) {
      await this.send(
        `${conversationUrl(connection, conversationId)}/assignments`,
        {
          ...(connection.assignee_id === null
            ? {}
            : { assignee_id: connection.assignee_id }),
          ...(connection.team_id === null ? {} : { team_id: connection.team_id }),
        },
        token,
        deadlineAt,
      );
    }
    await this.send(
      `${conversationUrl(connection, conversationId)}/toggle_status`,
      { status: 'open' },
      token,
      deadlineAt,
    );
  }

  private async send(
    url: string,
    body: Record<string, unknown>,
    token: string,
    deadlineAt: string,
  ): Promise<void> {
    const remaining = Date.parse(deadlineAt) - Date.now();
    if (remaining <= 0) throw new Error('Chatwoot handoff timed out');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        api_access_token: token,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(remaining),
    });
    if (!response.ok) {
      throw new Error(`Chatwoot handoff failed: ${response.status}`);
    }
  }
}

function receipt(
  command: ChatwootDeliveryCommand,
  code: ChatwootDeliveryCode,
  providerMessageId: string | null,
  credentialRefHash: string | null,
  requestHash: string,
  responseHash: string | null,
): ChatwootDeliveryReceipt {
  return {
    receipt_id: `delivery-receipt:${hash(
      `${command.tenant_id}:${command.delivery_id}:${code}`,
    ).slice(0, 32)}`,
    delivery_id: command.delivery_id,
    tenant_id: command.tenant_id,
    trace_id: command.trace_id,
    conversation_id: command.conversation_id,
    message_type: command.message_type,
    status:
      code === 'duplicate_delivery'
        ? 'duplicate'
        : code === 'ok'
          ? 'succeeded'
          : 'failed',
    code,
    provider_message_id: providerMessageId,
    audit: {
      delivery_id: command.delivery_id,
      tenant_id: command.tenant_id,
      trace_id: command.trace_id,
      conversation_id: command.conversation_id,
      message_type: command.message_type,
      idempotency_key_hash: hash(command.idempotency_key),
      credential_ref_hash: credentialRefHash,
      request_hash: requestHash,
      response_hash: responseHash,
      decision: code,
      created_at: new Date().toISOString(),
    },
  };
}

function failureReceipt(
  command: ChatwootDeliveryCommand,
  code: ChatwootDeliveryCode,
  credentialRefHash: string | null,
): ChatwootDeliveryReceipt {
  return receipt(
    command,
    code,
    null,
    credentialRefHash,
    hashJson(command),
    null,
  );
}

function mapStatus(status: number): ChatwootDeliveryCode {
  if (status >= 200 && status < 300) return 'ok';
  if (status === 400 || status === 422) return 'invalid_command';
  if (status === 401 || status === 403) return 'auth_failed';
  if (status === 404) return 'not_found';
  if (status === 408 || status === 429 || status >= 500) {
    return 'retryable_error';
  }
  return 'provider_error';
}

function readProviderMessageId(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || !('id' in body)) return null;
  const id = Reflect.get(body, 'id');
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null;
}

function conversationUrl(
  connection: ChatwootRuntimeConnection,
  conversationId: string,
): string {
  return `${connection.base_url.replace(/\/+$/, '')}/api/v1/accounts/${
    connection.account_id
  }/conversations/${conversationId}`;
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hashJson(value: unknown): string {
  return hash(JSON.stringify(value));
}

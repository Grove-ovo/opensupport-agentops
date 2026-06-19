import { createHash } from 'node:crypto';
import type {
  ChatwootDeliveryCode,
  ChatwootDeliveryCommand,
  ChatwootDeliveryReceipt,
} from '@opensupport/shared';
import { isUuid } from '@opensupport/shared';

export interface ChatwootDeliveryConnection {
  tenant_id: string;
  base_url: string;
  account_id: number;
  api_token_ref: string;
}

export interface ChatwootCredentialResolver {
  resolve(reference: string, tenantId: string): string | Promise<string>;
}

export interface ChatwootTransportRequest {
  url: string;
  headers: Readonly<Record<string, string>>;
  body: {
    content: string;
    message_type: 'outgoing';
    private: boolean;
    content_type: 'text';
    content_attributes: Readonly<Record<string, string | boolean>>;
  };
  deadline_at: string;
}

export interface ChatwootTransportResponse {
  status: number;
  body: unknown;
}

export interface ChatwootTransport {
  send(request: ChatwootTransportRequest): Promise<ChatwootTransportResponse>;
}

interface DeliveryRecord {
  input_hash: string;
  result: Promise<ChatwootDeliveryReceipt>;
}

export class ChatwootDeliveryService {
  readonly #records = new Map<string, DeliveryRecord>();

  constructor(
    readonly transport: ChatwootTransport,
    readonly credentialResolver: ChatwootCredentialResolver,
  ) {}

  async deliver(
    command: ChatwootDeliveryCommand,
    connection: ChatwootDeliveryConnection,
    now: Date | string = new Date(),
  ): Promise<ChatwootDeliveryReceipt> {
    const createdAt = normalizeTimestamp(now);
    const requestHash = hashJson(command);
    const idempotencyInputHash = hashJson({
      tenant_id: command.tenant_id,
      trace_id: command.trace_id,
      conversation_id: command.conversation_id,
      message_type: command.message_type,
      content_hash: command.content_hash,
    });
    const validationCode = validateCommand(command, connection, createdAt);
    if (validationCode !== null) {
      return receipt(command, validationCode, null, requestHash, null, createdAt);
    }

    const scope = `${command.tenant_id}:${command.idempotency_key}`;
    const existing = this.#records.get(scope);
    if (existing !== undefined) {
      if (existing.input_hash !== idempotencyInputHash) {
        return receipt(
          command,
          'idempotency_conflict',
          null,
          requestHash,
          hash(connection.api_token_ref),
          createdAt,
        );
      }
      const original = await existing.result;
      if (original.status === 'failed') {
        return receipt(
          command,
          original.code,
          null,
          requestHash,
          original.audit.credential_ref_hash,
          createdAt,
        );
      }
      return receipt(
        command,
        'duplicate_delivery',
        original.provider_message_id,
        requestHash,
        original.audit.credential_ref_hash,
        createdAt,
      );
    }

    const result = this.#send(
      command,
      connection,
      requestHash,
      createdAt,
    );
    const record = { input_hash: idempotencyInputHash, result };
    this.#records.set(scope, record);
    void result.then((resolved) => {
      if (
        resolved.status === 'failed' &&
        this.#records.get(scope) === record
      ) {
        this.#records.delete(scope);
      }
    });
    return result;
  }

  async #send(
    command: ChatwootDeliveryCommand,
    connection: ChatwootDeliveryConnection,
    requestHash: string,
    createdAt: string,
  ): Promise<ChatwootDeliveryReceipt> {
    const credentialHash = hash(connection.api_token_ref);
    let token: string;
    try {
      token = await this.credentialResolver.resolve(
        connection.api_token_ref,
        command.tenant_id,
      );
      if (token.trim().length === 0) throw new Error('empty credential');
    } catch {
      return receipt(
        command,
        'credential_unavailable',
        null,
        requestHash,
        credentialHash,
        createdAt,
      );
    }

    const transportRequest = buildChatwootTransportRequest(
      command,
      connection,
      token,
    );
    try {
      const response = await this.transport.send(transportRequest);
      const code = mapStatus(response.status);
      const providerMessageId =
        code === 'ok' ? readProviderMessageId(response.body) : null;
      return receipt(
        command,
        providerMessageId === null && code === 'ok' ? 'provider_error' : code,
        providerMessageId,
        requestHash,
        credentialHash,
        createdAt,
        response.body,
      );
    } catch (error) {
      return receipt(
        command,
        error instanceof ChatwootTransportError ? error.code : 'provider_error',
        null,
        requestHash,
        credentialHash,
        createdAt,
      );
    }
  }
}

export class ChatwootTransportError extends Error {
  constructor(readonly code: 'timed_out' | 'retryable_error') {
    super(code);
    this.name = 'ChatwootTransportError';
  }
}

export class FetchChatwootTransport implements ChatwootTransport {
  async send(request: ChatwootTransportRequest): Promise<ChatwootTransportResponse> {
    const remainingMs = Date.parse(request.deadline_at) - Date.now();
    if (remainingMs <= 0) throw new ChatwootTransportError('timed_out');
    try {
      const response = await fetch(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify(request.body),
        signal: AbortSignal.timeout(remainingMs),
      });
      return { status: response.status, body: await readResponseBody(response) };
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new ChatwootTransportError('timed_out');
      }
      throw new ChatwootTransportError('retryable_error');
    }
  }
}

export function buildChatwootTransportRequest(
  command: ChatwootDeliveryCommand,
  connection: ChatwootDeliveryConnection,
  apiToken: string,
): ChatwootTransportRequest {
  return {
    url: `${connection.base_url.replace(/\/+$/, '')}/api/v1/accounts/${connection.account_id}/conversations/${command.conversation_id}/messages`,
    headers: {
      'Content-Type': 'application/json',
      api_access_token: apiToken,
    },
    body: {
      content: command.content,
      message_type: 'outgoing',
      private: command.message_type === 'private_note',
      content_type: 'text',
      content_attributes: {
        agentops_generated: true,
        agentops_trace_id: command.trace_id,
        agentops_delivery_id: command.delivery_id,
      },
    },
    deadline_at: command.deadline_at,
  };
}

function validateCommand(
  command: ChatwootDeliveryCommand,
  connection: ChatwootDeliveryConnection,
  now: string,
): ChatwootDeliveryCode | null {
  if (connection.tenant_id !== command.tenant_id) return 'scope_mismatch';
  if (
    !isUuid(command.delivery_id) ||
    !isUuid(command.tenant_id) ||
    !isUuid(command.trace_id) ||
    Number.isNaN(Date.parse(now)) ||
    !/^[1-9]\d*$/.test(command.conversation_id) ||
    !['private_note', 'public_reply'].includes(command.message_type) ||
    command.content.trim().length === 0 ||
    command.content.length > 10_000 ||
    command.idempotency_key.trim().length === 0 ||
    Number.isNaN(Date.parse(command.deadline_at)) ||
    Date.parse(command.deadline_at) <= Date.parse(now) ||
    !Number.isInteger(connection.account_id) ||
    connection.account_id <= 0 ||
    connection.api_token_ref.trim().length === 0 ||
    !isSafeBaseUrl(connection.base_url)
  ) {
    return 'invalid_command';
  }
  return hash(command.content) === command.content_hash
    ? null
    : 'content_hash_mismatch';
}

function receipt(
  command: ChatwootDeliveryCommand,
  code: ChatwootDeliveryCode,
  providerMessageId: string | null,
  requestHash: string,
  credentialRefHash: string | null,
  createdAt: string,
  responseBody?: unknown,
): ChatwootDeliveryReceipt {
  const succeeded = code === 'ok';
  const responseHash =
    responseBody === undefined ? null : hashJson(responseBody);
  return Object.freeze({
    receipt_id: `delivery-receipt:${hash(
      `${command.tenant_id}:${command.trace_id}:${command.delivery_id}:${command.idempotency_key}:${code}`,
    ).slice(0, 32)}`,
    delivery_id: command.delivery_id,
    tenant_id: command.tenant_id,
    trace_id: command.trace_id,
    conversation_id: command.conversation_id,
    message_type: command.message_type,
    status:
      code === 'duplicate_delivery'
        ? 'duplicate'
        : succeeded
          ? 'succeeded'
          : 'failed',
    code,
    provider_message_id: providerMessageId,
    audit: Object.freeze({
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
      created_at: createdAt,
    }),
  });
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
  const id = (body as { id?: unknown }).id;
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null;
}

function isSafeBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function normalizeTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'invalid';
  return date.toISOString();
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw_body_hash: hash(text) };
  }
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hashJson(value: unknown): string {
  return hash(JSON.stringify(value));
}

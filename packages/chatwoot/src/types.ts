import type { CanonicalInboundEvent, CanonicalInboundEventSource } from '@opensupport/shared';

export type HeaderValue = string | readonly string[] | undefined;
export type RequestHeaders = Record<string, HeaderValue>;

export type ChatwootEndpointDecision =
  | 'pipeline_seeded'
  | 'duplicate'
  | 'audit_only'
  | 'rejected';

export type ChatwootReasonCode =
  | 'canonical_customer_message'
  | 'duplicate_delivery'
  | 'invalid_signature'
  | 'invalid_payload'
  | 'missing_message_identity'
  | 'non_customer_message'
  | 'self_outgoing_message'
  | 'webhook_signature_not_configured';

export interface DedupeStore {
  claim(keys: readonly string[]): boolean | Promise<boolean>;
}

export interface ChatwootEndpointRequest {
  tenantId: string;
  headers: RequestHeaders;
  rawBody: string | Buffer;
  parsedBody?: unknown;
  webhookSecret?: string | undefined;
  agentopsActorIds?: readonly string[] | undefined;
  agentopsMessageSignatures?: readonly string[] | undefined;
}

export interface ChatwootEndpointOptions {
  dedupeStore?: DedupeStore | undefined;
}

export interface ChatwootEndpointResponseBody {
  accepted: boolean;
  decision: ChatwootEndpointDecision;
  reason_code: ChatwootReasonCode;
  should_seed_pipeline: boolean;
  dedupe_key?: string;
  payload_hash?: string;
  canonical_event?: CanonicalInboundEvent;
}

export interface ChatwootEndpointResponse {
  status: 202 | 400 | 401 | 503;
  body: ChatwootEndpointResponseBody;
}

export interface NormalizationOptions {
  tenantId: string;
  source: CanonicalInboundEventSource;
  payload: unknown;
  rawBody: string | Buffer;
  headers: RequestHeaders;
  agentopsActorIds?: readonly string[] | undefined;
  agentopsMessageSignatures?: readonly string[] | undefined;
}

export interface NormalizedChatwootEvent {
  canonicalEvent?: CanonicalInboundEvent;
  payloadHash: string;
  deliveryDedupeKey?: string;
  reasonCode: ChatwootReasonCode;
}

export interface SignatureVerificationInput {
  headers: RequestHeaders;
  rawBody: string | Buffer;
  secret?: string | undefined;
}

export interface SignatureVerificationResult {
  configured: boolean;
  verified: boolean;
  reason?: 'missing_signature_headers' | 'mismatch' | 'secret_not_configured';
}

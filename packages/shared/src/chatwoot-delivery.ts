export type ChatwootDeliveryMessageType = 'private_note' | 'public_reply';

export type ChatwootDeliveryCode =
  | 'ok'
  | 'duplicate_delivery'
  | 'invalid_command'
  | 'scope_mismatch'
  | 'content_hash_mismatch'
  | 'credential_unavailable'
  | 'auth_failed'
  | 'not_found'
  | 'timed_out'
  | 'retryable_error'
  | 'provider_error'
  | 'idempotency_conflict';

export interface ChatwootDeliveryCommand {
  delivery_id: string;
  tenant_id: string;
  trace_id: string;
  conversation_id: string;
  message_type: ChatwootDeliveryMessageType;
  content: string;
  content_hash: string;
  idempotency_key: string;
  deadline_at: string;
}

export interface ChatwootDeliveryAudit {
  delivery_id: string;
  tenant_id: string;
  trace_id: string;
  conversation_id: string;
  message_type: ChatwootDeliveryMessageType;
  idempotency_key_hash: string;
  credential_ref_hash: string | null;
  request_hash: string;
  response_hash: string | null;
  decision: ChatwootDeliveryCode;
  created_at: string;
}

export interface ChatwootDeliveryReceipt {
  receipt_id: string;
  delivery_id: string;
  tenant_id: string;
  trace_id: string;
  conversation_id: string;
  message_type: ChatwootDeliveryMessageType;
  status: 'succeeded' | 'duplicate' | 'failed';
  code: ChatwootDeliveryCode;
  provider_message_id: string | null;
  audit: ChatwootDeliveryAudit;
}

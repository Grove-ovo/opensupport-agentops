export type CanonicalInboundEventSource = 'agent_bot' | 'account_webhook';

export interface CanonicalInboundEvent {
  tenant_id: string;
  source: CanonicalInboundEventSource;
  conversation_id: string;
  message_id: string;
  event_type: string;
  dedupe_key: string;
  payload_hash: string;
  is_customer_message: boolean;
  is_self_outgoing: boolean;
}

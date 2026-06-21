import { createHmac } from 'node:crypto';

const apiUrl = required('AGENTOPS_API_URL').replace(/\/+$/, '');
const tenantId = required('AGENTOPS_SMOKE_TENANT_ID');
const webhookSecret = required('CHATWOOT_WEBHOOK_SECRET');
const messageId = `smoke-${Date.now()}`;
const body = JSON.stringify({
  event: 'message_created',
  message: {
    id: messageId,
    content: required('AGENTOPS_SMOKE_MESSAGE'),
    message_type: 'incoming',
    private: false,
    conversation: { id: Number(required('AGENTOPS_SMOKE_CONVERSATION_ID')) },
    sender: { id: required('AGENTOPS_SMOKE_CONTACT_ID') },
  },
});
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = createHmac('sha256', webhookSecret)
  .update(`${timestamp}.${body}`)
  .digest('hex');
const response = await fetch(
  `${apiUrl}/api/v1/chatwoot/agent-bot/${tenantId}`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Chatwoot-Timestamp': timestamp,
      'X-Chatwoot-Signature': `sha256=${signature}`,
      'X-Chatwoot-Delivery': `smoke-${messageId}`,
    },
    body,
  },
);
const output = await response.text();
console.log(output);
if (!response.ok) process.exitCode = 1;

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

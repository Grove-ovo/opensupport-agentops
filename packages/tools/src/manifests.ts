import type { ToolManifest, ToolName } from '@opensupport/shared';

export const TOOL_MANIFEST_VERSION_ID = 'tools-v1';

const orderSchema = {
  type: 'object',
  required: ['order_id'],
  properties: {
    order_id: { type: 'string', minLength: 2, maxLength: 128 },
  },
  additionalProperties: false,
} as const;

export const TOOL_MANIFESTS: Readonly<Record<ToolName, ToolManifest>> = {
  get_order_status: {
    name: 'get_order_status',
    version_id: TOOL_MANIFEST_VERSION_ID,
    description: 'Read a customer-owned order status.',
    input_schema: orderSchema,
    risk_level: 'low',
    timeout_ms: 1500,
    max_retries: 1,
    required_permissions: ['order:read'],
    idempotent: true,
    dry_run: false,
  },
  get_logistics_status: {
    name: 'get_logistics_status',
    version_id: TOOL_MANIFEST_VERSION_ID,
    description: 'Read shipment state for a customer-owned order.',
    input_schema: orderSchema,
    risk_level: 'low',
    timeout_ms: 1500,
    max_retries: 1,
    required_permissions: ['logistics:read'],
    idempotent: true,
    dry_run: false,
  },
  check_refund_eligibility: {
    name: 'check_refund_eligibility',
    version_id: TOOL_MANIFEST_VERSION_ID,
    description: 'Evaluate refund eligibility without creating a refund.',
    input_schema: orderSchema,
    risk_level: 'medium',
    timeout_ms: 2000,
    max_retries: 1,
    required_permissions: ['refund:read'],
    idempotent: true,
    dry_run: true,
  },
  create_refund_request_dry_run: {
    name: 'create_refund_request_dry_run',
    version_id: TOOL_MANIFEST_VERSION_ID,
    description: 'Create a deterministic refund request preview only.',
    input_schema: {
      type: 'object',
      required: ['order_id', 'reason'],
      properties: {
        order_id: { type: 'string', minLength: 2, maxLength: 128 },
        reason: { type: 'string', minLength: 3, maxLength: 500 },
      },
      additionalProperties: false,
    },
    risk_level: 'high',
    timeout_ms: 2500,
    max_retries: 0,
    required_permissions: ['refund:dry_run'],
    idempotent: true,
    dry_run: true,
  },
  escalate_to_human: {
    name: 'escalate_to_human',
    version_id: TOOL_MANIFEST_VERSION_ID,
    description: 'Create a handoff recommendation without Chatwoot delivery.',
    input_schema: {
      type: 'object',
      required: ['reason'],
      properties: {
        reason: { type: 'string', minLength: 3, maxLength: 500 },
      },
      additionalProperties: false,
    },
    risk_level: 'medium',
    timeout_ms: 1000,
    max_retries: 0,
    required_permissions: ['handoff:create'],
    idempotent: true,
    dry_run: true,
  },
};

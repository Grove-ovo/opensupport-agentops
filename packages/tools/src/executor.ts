import { createHash } from 'node:crypto';
import type {
  ToolCallRequest,
  ToolCallResult,
  ToolManifest,
  ToolName,
  ToolResultCode,
} from '@opensupport/shared';
import { isUuid } from '@opensupport/shared';
import { TOOL_MANIFESTS } from './manifests.js';
import {
  MockBusinessRepository,
  type MockOrderRecord,
} from './repository.js';

export interface ToolExecutorOptions {
  now?: Date | string | undefined;
}

export class ToolExecutor {
  readonly repository: MockBusinessRepository;
  readonly manifests: Readonly<Record<ToolName, ToolManifest>>;
  readonly idempotencyResults = new Map<string, IdempotencyRecord>();

  constructor(
    repository: MockBusinessRepository,
    manifests: Readonly<Record<ToolName, ToolManifest>> = TOOL_MANIFESTS,
  ) {
    this.repository = repository;
    this.manifests = manifests;
  }

  async execute(
    request: ToolCallRequest,
    options: ToolExecutorOptions = {},
  ): Promise<ToolCallResult> {
    const now = normalizeNow(options.now);
    const manifest = this.manifests[request.tool_name];
    const baseError = validateRequest(request, manifest, now);
    if (baseError !== null) {
      return createResult(request, manifest, baseError, null, now);
    }

    const schemaError = validateSchema(request.arguments, manifest.input_schema);
    if (schemaError) {
      return createResult(request, manifest, 'invalid_schema', null, now);
    }
    if (
      manifest.required_permissions.some(
        (permission) => !request.permissions.includes(permission),
      )
    ) {
      return createResult(request, manifest, 'permission_denied', null, now);
    }

    const idempotencyScope = `${request.tenant_id}:${request.tool_name}:${request.idempotency_key}`;
    const inputHash = hashJson(request.arguments);
    const previous = this.idempotencyResults.get(idempotencyScope);
    if (previous !== undefined) {
      if (previous.input_hash !== inputHash) {
        return createResult(
          request,
          manifest,
          'idempotency_conflict',
          null,
          now,
        );
      }
      return {
        ...previous.result,
        call_id: request.call_id,
        trace_id: request.trace_id,
        status: 'duplicate',
        code: 'duplicate_request',
        audit: {
          ...previous.result.audit,
          call_id: request.call_id,
          trace_id: request.trace_id,
          decision: 'duplicate_request',
          created_at: now,
        },
      };
    }

    const latency = this.repository.latencyByTool[request.tool_name] ?? 0;
    const deadlineMs = Date.parse(request.deadline_at);
    const timeoutAt = Math.min(
      deadlineMs,
      Date.parse(now) + manifest.timeout_ms,
    );
    if (Date.parse(now) + latency > timeoutAt) {
      return createResult(request, manifest, 'timed_out', null, now);
    }

    const outcome = executeBusinessTool(request, this.repository);
    const result = createResult(
      request,
      manifest,
      outcome.code,
      outcome.data,
      new Date(Date.parse(now) + latency).toISOString(),
    );
    if (manifest.idempotent && result.status === 'succeeded') {
      this.idempotencyResults.set(idempotencyScope, {
        input_hash: inputHash,
        result,
      });
    }
    return result;
  }
}

function executeBusinessTool(
  request: ToolCallRequest,
  repository: MockBusinessRepository,
): BusinessOutcome {
  if (request.tool_name === 'escalate_to_human') {
    return {
      code: 'ok',
      data: {
        handoff_required: true,
        reason: request.arguments.reason,
        delivery_performed: false,
      },
    };
  }

  const orderId = String(request.arguments.order_id);
  const order = repository.findOrder(orderId);
  if (order === undefined) {
    return { code: 'not_found', data: null };
  }
  if (
    order.tenant_id !== request.tenant_id ||
    order.contact_id !== request.contact_id
  ) {
    return { code: 'unauthorized_order', data: null };
  }
  if (order.failure_mode === 'retryable') {
    return { code: 'retryable_error', data: null };
  }

  switch (request.tool_name) {
    case 'get_order_status':
      return {
        code: 'ok',
        data: {
          order_id: order.order_id,
          order_status: order.order_status,
        },
      };
    case 'get_logistics_status':
      return {
        code: 'ok',
        data: {
          order_id: order.order_id,
          logistics_status: order.logistics_status,
          tracking_number: order.tracking_number,
        },
      };
    case 'check_refund_eligibility':
      return {
        code: 'ok',
        data: {
          order_id: order.order_id,
          eligible: order.refund_eligible,
          reason: order.refund_reason,
          dry_run: true,
        },
      };
    case 'create_refund_request_dry_run':
      return {
        code: 'ok',
        data: {
          order_id: order.order_id,
          eligible: order.refund_eligible,
          request_status: order.refund_eligible
            ? 'ready_for_approval'
            : 'not_eligible',
          requested_reason: request.arguments.reason,
          dry_run: true,
          external_side_effect: false,
        },
      };
  }
}

function validateRequest(
  request: ToolCallRequest,
  manifest: ToolManifest | undefined,
  now: string,
): ToolResultCode | null {
  if (
    !isUuid(request.call_id) ||
    !isUuid(request.trace_id) ||
    !isUuid(request.tenant_id) ||
    request.contact_id.trim().length === 0 ||
    request.idempotency_key.trim().length === 0 ||
    Number.isNaN(Date.parse(request.deadline_at)) ||
    Date.parse(request.deadline_at) <= Date.parse(now) ||
    manifest === undefined
  ) {
    return 'invalid_request';
  }
  if (request.tool_manifest_version_id !== manifest.version_id) {
    return 'manifest_version_mismatch';
  }
  return null;
}

function validateSchema(
  value: Record<string, unknown>,
  schema: ToolManifest['input_schema'],
): boolean {
  const keys = Object.keys(value);
  if (
    schema.additionalProperties === false &&
    keys.some((key) => schema.properties[key] === undefined)
  ) {
    return true;
  }
  for (const field of schema.required) {
    if (value[field] === undefined) return true;
  }
  for (const [field, fieldSchema] of Object.entries(schema.properties)) {
    const fieldValue = value[field];
    if (fieldValue === undefined) continue;
    if (typeof fieldValue !== fieldSchema.type) return true;
    if (typeof fieldValue === 'string') {
      if (
        (fieldSchema.minLength !== undefined &&
          fieldValue.length < fieldSchema.minLength) ||
        (fieldSchema.maxLength !== undefined &&
          fieldValue.length > fieldSchema.maxLength)
      ) {
        return true;
      }
    }
  }
  return false;
}

function createResult(
  request: ToolCallRequest,
  manifest: ToolManifest | undefined,
  code: ToolResultCode,
  data: Record<string, unknown> | null,
  createdAt: string,
): ToolCallResult {
  const succeeded = code === 'ok';
  const outputHash = data === null ? null : hashJson(data);
  const resultId = `tool-result:${createHash('sha256')
    .update(
      [
        request.tenant_id,
        request.trace_id,
        request.tool_name,
        request.idempotency_key,
        code,
        outputHash ?? '',
      ].join(':'),
      'utf8',
    )
    .digest('hex')
    .slice(0, 32)}`;
  return {
    call_id: request.call_id,
    result_id: resultId,
    trace_id: request.trace_id,
    tenant_id: request.tenant_id,
    tool_name: request.tool_name,
    status: succeeded ? 'succeeded' : 'failed',
    code,
    retryable: code === 'retryable_error',
    dry_run: manifest?.dry_run ?? true,
    data,
    audit: {
      call_id: request.call_id,
      trace_id: request.trace_id,
      tenant_id: request.tenant_id,
      tool_name: request.tool_name,
      tool_manifest_version_id: request.tool_manifest_version_id,
      decision: code,
      input_hash: hashJson(request.arguments),
      output_hash: outputHash,
      created_at: createdAt,
    },
  };
}

function hashJson(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)), 'utf8')
    .digest('hex');
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareText(left, right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

function normalizeNow(value: Date | string | undefined): string {
  const date = value === undefined ? new Date() : new Date(value);
  return date.toISOString();
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

interface BusinessOutcome {
  code: ToolResultCode;
  data: Record<string, unknown> | null;
}

interface IdempotencyRecord {
  input_hash: string;
  result: ToolCallResult;
}

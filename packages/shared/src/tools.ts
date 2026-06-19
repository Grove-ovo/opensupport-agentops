export type ToolName =
  | 'get_order_status'
  | 'get_logistics_status'
  | 'check_refund_eligibility'
  | 'create_refund_request_dry_run'
  | 'escalate_to_human';

export type ToolRiskLevel = 'low' | 'medium' | 'high';

export type ToolResultCode =
  | 'ok'
  | 'duplicate_request'
  | 'invalid_schema'
  | 'invalid_request'
  | 'manifest_version_mismatch'
  | 'permission_denied'
  | 'unauthorized_order'
  | 'not_found'
  | 'timed_out'
  | 'retryable_error'
  | 'idempotency_conflict'
  | 'dry_run_only';

export interface ToolJsonSchema {
  type: 'object';
  required: readonly string[];
  properties: Readonly<Record<
    string,
    {
      type: 'string' | 'number' | 'boolean';
      minLength?: number;
      maxLength?: number;
    }
  >>;
  additionalProperties: false;
}

export interface ToolManifest {
  name: ToolName;
  version_id: string;
  description: string;
  input_schema: ToolJsonSchema;
  risk_level: ToolRiskLevel;
  timeout_ms: number;
  max_retries: number;
  required_permissions: readonly string[];
  idempotent: boolean;
  dry_run: boolean;
}

export interface ToolCallRequest {
  call_id: string;
  trace_id: string;
  tenant_id: string;
  contact_id: string;
  tool_name: ToolName;
  tool_manifest_version_id: string;
  idempotency_key: string;
  arguments: Record<string, unknown>;
  permissions: string[];
  deadline_at: string;
}

export interface ToolAuditRecord {
  call_id: string;
  trace_id: string;
  tenant_id: string;
  tool_name: ToolName;
  tool_manifest_version_id: string;
  decision: ToolResultCode;
  input_hash: string;
  output_hash: string | null;
  created_at: string;
}

export interface ToolCallResult<T = Record<string, unknown>> {
  call_id: string;
  result_id: string;
  trace_id: string;
  tenant_id: string;
  tool_name: ToolName;
  status: 'succeeded' | 'failed' | 'duplicate';
  code: ToolResultCode;
  retryable: boolean;
  dry_run: boolean;
  data: T | null;
  audit: ToolAuditRecord;
}

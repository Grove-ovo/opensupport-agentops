import { readFile } from 'node:fs/promises';
import {
  isUuid,
  type AgentIntent,
  type EvalCase,
  type EvalDatasetSplit,
  type ResponseAction,
  type RuntimeMode,
  type SecurityAttackCategory,
  type SecurityEvalCase,
  type ToolName,
} from '@opensupport/shared';

export type EvalDatasetErrorCode =
  | 'invalid_json'
  | 'invalid_case'
  | 'duplicate_case'
  | 'mixed_dataset_version'
  | 'unsafe_fixture';

export class EvalDatasetError extends Error {
  constructor(
    readonly code: EvalDatasetErrorCode,
    message: string,
    readonly line: number | null = null,
  ) {
    super(message);
    this.name = 'EvalDatasetError';
  }
}

export interface ParsedEvalDataset<TCase extends EvalCase | SecurityEvalCase> {
  dataset_version: string;
  cases: readonly TCase[];
  split_counts: Readonly<Record<EvalDatasetSplit, number>>;
}

const SPLITS = new Set<EvalDatasetSplit>(['dev', 'test', 'regression']);
const INTENTS = new Set<AgentIntent>([
  'order_status',
  'logistics_query',
  'refund_eligibility',
  'refund_request',
  'return_policy',
  'invoice_request',
  'complaint_escalation',
  'unknown',
]);
const ACTIONS = new Set<ResponseAction>([
  'reply',
  'clarify',
  'private_note',
  'handoff',
]);
const RUNTIME_MODES = new Set<RuntimeMode>(['shadow', 'assist', 'auto']);
const TOOL_NAMES = new Set<ToolName>([
  'get_order_status',
  'get_logistics_status',
  'check_refund_eligibility',
  'create_refund_request_dry_run',
  'escalate_to_human',
]);
const SECURITY_CATEGORIES = new Set<SecurityAttackCategory>([
  'prompt_injection',
  'approval_bypass',
  'credential_request',
  'system_prompt_request',
  'unauthorized_order_access',
  'retrieval_injection',
  'unsafe_tool',
  'pii_exfiltration',
]);
const UNSAFE_FIXTURE_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{8,}\b/u,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/u,
  /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/u,
  /\b\d{3}-\d{2}-\d{4}\b/u,
  /\b(?:\d[ -]*?){13,19}\b/u,
];

export async function loadReplayDatasetFile(
  path: string,
): Promise<ParsedEvalDataset<EvalCase>> {
  return parseReplayDataset(await readFile(path, 'utf8'));
}

export async function loadSecurityDatasetFile(
  path: string,
): Promise<ParsedEvalDataset<SecurityEvalCase>> {
  return parseSecurityDataset(await readFile(path, 'utf8'));
}

export function parseReplayDataset(
  jsonl: string,
): ParsedEvalDataset<EvalCase> {
  return parseDataset(jsonl, validateReplayCase);
}

export function parseSecurityDataset(
  jsonl: string,
): ParsedEvalDataset<SecurityEvalCase> {
  return parseDataset(jsonl, validateSecurityCase);
}

function parseDataset<TCase extends EvalCase | SecurityEvalCase>(
  jsonl: string,
  validate: (value: unknown, line: number) => TCase,
): ParsedEvalDataset<TCase> {
  const cases: TCase[] = [];
  const ids = new Set<string>();
  const versions = new Set<string>();
  const splitCounts: Record<EvalDatasetSplit, number> = {
    dev: 0,
    test: 0,
    regression: 0,
  };
  for (const [index, rawLine] of jsonl.split(/\r?\n/u).entries()) {
    if (rawLine.trim().length === 0) continue;
    const line = index + 1;
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawLine);
    } catch {
      throw new EvalDatasetError('invalid_json', 'invalid JSONL row', line);
    }
    const value = validate(parsed, line);
    if (ids.has(value.case_id)) {
      throw new EvalDatasetError(
        'duplicate_case',
        `duplicate case ${value.case_id}`,
        line,
      );
    }
    ids.add(value.case_id);
    versions.add(value.dataset_version);
    splitCounts[value.split] += 1;
    cases.push(Object.freeze(value));
  }
  if (cases.length === 0) {
    throw new EvalDatasetError('invalid_case', 'dataset is empty');
  }
  if (versions.size !== 1) {
    throw new EvalDatasetError(
      'mixed_dataset_version',
      'dataset must contain exactly one version',
    );
  }
  return Object.freeze({
    dataset_version: versions.values().next().value as string,
    cases: Object.freeze(cases),
    split_counts: Object.freeze(splitCounts),
  });
}

function validateReplayCase(value: unknown, line: number): EvalCase {
  const row = record(value, line);
  if (
    !/^replay-\d{4}$/u.test(string(row, 'case_id')) ||
    !validVersion(string(row, 'dataset_version')) ||
    !SPLITS.has(string(row, 'split') as EvalDatasetSplit) ||
    !isUuid(string(row, 'tenant_id')) ||
    !INTENTS.has(string(row, 'expected_intent') as AgentIntent) ||
    !ACTIONS.has(string(row, 'expected_action') as ResponseAction) ||
    !RUNTIME_MODES.has(
      string(row, 'expected_runtime_ceiling') as RuntimeMode,
    ) ||
    typeof row.high_risk !== 'boolean' ||
    typeof row.requires_evidence !== 'boolean' ||
    !positiveNumber(row.max_latency_ms) ||
    !nonNegativeNumber(row.max_cost)
  ) {
    invalid(line);
  }
  const maskedInput = safeText(row, 'masked_input', line);
  const evidenceIds = strings(row, 'expected_evidence_ids', line);
  const toolNames = strings(row, 'required_tool_names', line);
  const tags = strings(row, 'tags', line);
  if (
    evidenceIds.some((item) => item.length > 512) ||
    !toolNames.every((item) => TOOL_NAMES.has(item as ToolName)) ||
    (row.requires_evidence === true && evidenceIds.length === 0) ||
    tags.length === 0
  ) {
    invalid(line);
  }
  return {
    case_id: row.case_id as string,
    dataset_version: row.dataset_version as string,
    split: row.split as EvalDatasetSplit,
    tenant_id: row.tenant_id as string,
    masked_input: maskedInput,
    expected_intent: row.expected_intent as AgentIntent,
    expected_action: row.expected_action as ResponseAction,
    high_risk: row.high_risk as boolean,
    requires_evidence: row.requires_evidence as boolean,
    expected_evidence_ids: Object.freeze(evidenceIds),
    required_tool_names: Object.freeze(toolNames as ToolName[]),
    expected_runtime_ceiling: row.expected_runtime_ceiling as RuntimeMode,
    max_latency_ms: row.max_latency_ms as number,
    max_cost: row.max_cost as number,
    tags: Object.freeze(tags),
  };
}

function validateSecurityCase(
  value: unknown,
  line: number,
): SecurityEvalCase {
  const row = record(value, line);
  if (
    !/^security-\d{4}$/u.test(string(row, 'case_id')) ||
    !validVersion(string(row, 'dataset_version')) ||
    !SPLITS.has(string(row, 'split') as EvalDatasetSplit) ||
    !isUuid(string(row, 'tenant_id')) ||
    !SECURITY_CATEGORIES.has(
      string(row, 'attack_category') as SecurityAttackCategory,
    ) ||
    typeof row.p0 !== 'boolean' ||
    !new Set(['clarify', 'private_note', 'handoff']).has(
      string(row, 'required_safe_action'),
    ) ||
    typeof row.expect_unauthorized_access_block !== 'boolean' ||
    typeof row.expect_pii_safe !== 'boolean'
  ) {
    invalid(line);
  }
  const forbiddenActions = strings(row, 'forbidden_actions', line);
  const forbiddenTools = strings(row, 'forbidden_tool_names', line);
  const tags = strings(row, 'tags', line);
  if (
    forbiddenActions.length === 0 ||
    !forbiddenActions.every((item) => ACTIONS.has(item as ResponseAction)) ||
    !forbiddenTools.every((item) => TOOL_NAMES.has(item as ToolName)) ||
    tags.length === 0
  ) {
    invalid(line);
  }
  return {
    case_id: row.case_id as string,
    dataset_version: row.dataset_version as string,
    split: row.split as EvalDatasetSplit,
    tenant_id: row.tenant_id as string,
    masked_input: safeText(row, 'masked_input', line),
    attack_category: row.attack_category as SecurityAttackCategory,
    p0: row.p0 as boolean,
    required_safe_action: row.required_safe_action as SecurityEvalCase['required_safe_action'],
    forbidden_actions: Object.freeze(forbiddenActions as ResponseAction[]),
    forbidden_tool_names: Object.freeze(forbiddenTools as ToolName[]),
    expect_unauthorized_access_block:
      row.expect_unauthorized_access_block as boolean,
    expect_pii_safe: row.expect_pii_safe as boolean,
    tags: Object.freeze(tags),
  };
}

function safeText(
  row: Record<string, unknown>,
  field: string,
  line: number,
): string {
  const value = string(row, field);
  if (
    value.trim() !== value ||
    value.length === 0 ||
    value.length > 2_000 ||
    UNSAFE_FIXTURE_PATTERNS.some((pattern) => pattern.test(value))
  ) {
    throw new EvalDatasetError(
      'unsafe_fixture',
      `${field} contains unsafe fixture data`,
      line,
    );
  }
  return value;
}

function strings(
  row: Record<string, unknown>,
  field: string,
  line: number,
): string[] {
  const value = row[field];
  if (
    !Array.isArray(value) ||
    value.some(
      (item) =>
        typeof item !== 'string' ||
        item.trim() !== item ||
        item.length === 0,
    ) ||
    new Set(value).size !== value.length
  ) {
    invalid(line);
  }
  return [...(value as string[])];
}

function record(value: unknown, line: number): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid(line);
  }
  return value as Record<string, unknown>;
}

function string(row: Record<string, unknown>, field: string): string {
  return typeof row[field] === 'string' ? row[field] : '';
}

function positiveNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function nonNegativeNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function validVersion(value: string): boolean {
  return /^[A-Za-z0-9._:-]{1,128}$/u.test(value);
}

function invalid(line: number): never {
  throw new EvalDatasetError(
    'invalid_case',
    'evaluation case is incomplete or invalid',
    line,
  );
}

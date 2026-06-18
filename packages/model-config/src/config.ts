import { createHash, randomUUID } from 'node:crypto';
import type { TenantModelConfig } from '@opensupport/shared';
import { encryptApiKey } from './envelope.js';
import { ModelConfigValidationError } from './errors.js';
import type {
  ConfigFingerprintInput,
  CreateTenantModelConfigInput,
  CreateTenantModelConfigOptions,
  ModelConfigValidationIssue,
} from './types.js';

const MAX_TIMEOUT_MS = 120_000;
const MAX_BUDGET = 999_999.999_999;

export function createTenantModelConfig(
  input: CreateTenantModelConfigInput,
  options: CreateTenantModelConfigOptions,
): TenantModelConfig {
  const normalized = validateAndNormalizeInput(input);
  const encryptedApiKeyReference = encryptApiKey({
    apiKey: input.apiKey,
    masterKey: options.masterKey,
    keyId: options.keyId,
    tenantId: normalized.tenantId,
    provider: normalized.provider,
  });
  const configFingerprint = createConfigFingerprint(normalized);

  return {
    id: randomUUID(),
    tenant_id: normalized.tenantId,
    version: normalized.version,
    provider: normalized.provider,
    fast_model: normalized.fastModel,
    strong_model: normalized.strongModel,
    embedding_model: normalized.embeddingModel,
    fallback_model: normalized.fallbackModel,
    timeout_ms: normalized.timeoutMs,
    max_cost_per_ticket: normalized.maxCostPerTicket,
    daily_budget: normalized.dailyBudget,
    budget_currency: normalized.budgetCurrency,
    encrypted_api_key_ref: encryptedApiKeyReference,
    is_active: normalized.isActive,
    config_fingerprint: configFingerprint,
  };
}

function createConfigFingerprint(
  input: ConfigFingerprintInput,
): string {
  const canonical = [
    input.tenantId,
    input.provider,
    input.fastModel,
    input.strongModel,
    input.embeddingModel,
    input.fallbackModel,
    String(input.timeoutMs),
    String(input.maxCostPerTicket),
    String(input.dailyBudget),
    input.budgetCurrency,
  ].join('\u001f');

  return createHash('sha256').update(canonical).digest('hex');
}

interface NormalizedModelConfigInput {
  tenantId: string;
  version: number;
  provider: string;
  fastModel: string;
  strongModel: string;
  embeddingModel: string;
  fallbackModel: string;
  timeoutMs: number;
  maxCostPerTicket: number;
  dailyBudget: number;
  budgetCurrency: string;
  apiKey: string;
  isActive: boolean;
}

function validateAndNormalizeInput(
  input: CreateTenantModelConfigInput,
): NormalizedModelConfigInput {
  const issues: ModelConfigValidationIssue[] = [];
  const tenantId = requireNonBlank(input.tenantId, 'tenantId', issues);

  if (
    tenantId.length > 0 &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)
  ) {
    issues.push({ field: 'tenantId', code: 'invalid_format' });
  }

  const provider = requireNonBlank(input.provider, 'provider', issues).toLowerCase();
  const fastModel = requireNonBlank(input.fastModel, 'fastModel', issues);
  const strongModel = requireNonBlank(input.strongModel, 'strongModel', issues);
  const embeddingModel = requireNonBlank(input.embeddingModel, 'embeddingModel', issues);
  const fallbackModel = requireNonBlank(input.fallbackModel, 'fallbackModel', issues);
  const budgetCurrency = (input.budgetCurrency ?? 'USD').trim().toUpperCase();

  if (!Number.isInteger(input.version)) {
    issues.push({ field: 'version', code: 'invalid_integer' });
  } else if (input.version < 1) {
    issues.push({ field: 'version', code: 'out_of_range' });
  }

  if (!Number.isInteger(input.timeoutMs)) {
    issues.push({ field: 'timeoutMs', code: 'invalid_integer' });
  } else if (input.timeoutMs < 1 || input.timeoutMs > MAX_TIMEOUT_MS) {
    issues.push({ field: 'timeoutMs', code: 'out_of_range' });
  }

  validateBudget(input.maxCostPerTicket, 'maxCostPerTicket', issues);
  validateBudget(input.dailyBudget, 'dailyBudget', issues);

  if (!/^[A-Z]{3}$/.test(budgetCurrency)) {
    issues.push({ field: 'budgetCurrency', code: 'invalid_currency' });
  }

  if (input.apiKey.trim().length === 0) {
    issues.push({ field: 'apiKey', code: 'required' });
  }

  if (issues.length > 0) {
    throw new ModelConfigValidationError(issues);
  }

  return {
    tenantId,
    version: input.version,
    provider,
    fastModel,
    strongModel,
    embeddingModel,
    fallbackModel,
    timeoutMs: input.timeoutMs,
    maxCostPerTicket: input.maxCostPerTicket,
    dailyBudget: input.dailyBudget,
    budgetCurrency,
    apiKey: input.apiKey,
    isActive: input.isActive ?? true,
  };
}

function requireNonBlank(
  value: string,
  field: ModelConfigValidationIssue['field'],
  issues: ModelConfigValidationIssue[],
): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    issues.push({ field, code: 'required' });
  }

  return normalized;
}

function validateBudget(
  value: number,
  field: 'maxCostPerTicket' | 'dailyBudget',
  issues: ModelConfigValidationIssue[],
): void {
  if (!Number.isFinite(value)) {
    issues.push({ field, code: 'invalid_number' });
  } else if (value < 0 || value > MAX_BUDGET) {
    issues.push({ field, code: 'out_of_range' });
  } else if (Math.abs(value - Math.round(value * 1_000_000) / 1_000_000) > 1e-12) {
    issues.push({ field, code: 'invalid_precision' });
  }
}

import type { TenantModelConfig } from '@opensupport/shared';

export interface CreateTenantModelConfigInput {
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
  budgetCurrency?: string | undefined;
  apiKey: string;
  isActive?: boolean | undefined;
}

export interface CreateTenantModelConfigOptions {
  masterKey: Uint8Array;
  keyId: string;
}

export interface EncryptApiKeyInput {
  apiKey: string;
  masterKey: Uint8Array;
  keyId: string;
  tenantId: string;
  provider: string;
}

export interface DecryptApiKeyInput {
  encryptedReference: string;
  masterKey: Uint8Array;
  tenantId: string;
  provider: string;
}

export interface ModelConfigValidationIssue {
  field: keyof CreateTenantModelConfigInput;
  code:
    | 'required'
    | 'invalid_integer'
    | 'out_of_range'
    | 'invalid_currency'
    | 'invalid_number'
    | 'invalid_precision'
    | 'invalid_format';
}

export interface ConfigFingerprintInput {
  tenantId: string;
  provider: string;
  fastModel: string;
  strongModel: string;
  embeddingModel: string;
  fallbackModel: string;
  timeoutMs: number;
  maxCostPerTicket: number;
  dailyBudget: number;
  budgetCurrency: string;
}

export type TenantModelConfigRecord = TenantModelConfig;

export type SecretReferenceErrorCode =
  | 'invalid_master_key'
  | 'invalid_key_id'
  | 'invalid_reference'
  | 'decryption_failed';

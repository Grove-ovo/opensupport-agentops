import { readFileSync } from 'node:fs';

const migrationPath = 'infra/migrations/0002_tenant_model_config_versions.sql';
const docPath = 'docs/tenant_model_config.md';
const sharedTypePath = 'packages/shared/src/model-config.ts';
const packagePath = 'packages/model-config/src/index.ts';
const verificationPath = 'infra/verification/phase1c_tenant_model_config.sql';
const envPath = '.env.example';

const migration = readFileSync(migrationPath, 'utf8');
const doc = readFileSync(docPath, 'utf8');
const sharedType = readFileSync(sharedTypePath, 'utf8');
const packageIndex = readFileSync(packagePath, 'utf8');
const verification = readFileSync(verificationPath, 'utf8');
const envExample = readFileSync(envPath, 'utf8');

const failures = [];

for (const field of [
  'tenant_id',
  'version',
  'provider',
  'fast_model',
  'strong_model',
  'embedding_model',
  'fallback_model',
  'timeout_ms',
  'max_cost_per_ticket',
  'daily_budget',
  'budget_currency',
  'encrypted_api_key_ref',
  'is_active',
  'config_fingerprint',
]) {
  if (!new RegExp(`\\b${field}\\b`).test(sharedType)) {
    failures.push(`${sharedTypePath} must define ${field}`);
  }
}

for (const contract of [
  'BEGIN;',
  'COMMIT;',
  'UNIQUE (tenant_id, version)',
  'tenant_model_configs_one_active_idx',
  'tenant_model_configs_provider_canonical_chk',
  'tenant_model_configs_models_canonical_chk',
  'prevent_tenant_model_config_mutation',
  'tenant_model_configs_encrypted_ref_chk',
]) {
  if (!migration.includes(contract)) {
    failures.push(`${migrationPath} must include ${contract}`);
  }
}

for (const assertion of [
  'immutable config update was not rejected',
  'second active config was not rejected',
  'non-canonical provider was not rejected',
  'expected exactly one active config version',
  'ROLLBACK;',
]) {
  if (!verification.includes(assertion)) {
    failures.push(`${verificationPath} must include ${assertion}`);
  }
}

for (const exportName of [
  'createTenantModelConfig',
  'encryptApiKey',
  'decryptApiKey',
  'parseMasterKey',
]) {
  if (!packageIndex.includes(exportName)) {
    failures.push(`${packagePath} must export ${exportName}`);
  }
}

for (const requirement of [
  'AES-256-GCM',
  'AGENTOPS_MASTER_KEY',
  'enc:v1:',
  'immutable',
  'plaintext',
]) {
  if (!doc.includes(requirement)) {
    failures.push(`${docPath} must document ${requirement}`);
  }
}

if (envExample.includes('OPENAI_API_KEY')) {
  failures.push(`${envPath} must not define a global provider key that bypasses tenant BYOK config`);
}

if (failures.length > 0) {
  console.error('Phase 1C validation failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Phase 1C validation passed');

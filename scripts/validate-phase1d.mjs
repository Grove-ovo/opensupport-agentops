import { readFileSync } from 'node:fs';

const migrationPath = 'infra/migrations/0003_llm_call_logging_cost_governance.sql';
const verificationPath = 'infra/verification/phase1d_llm_observability.sql';
const docPath = 'docs/llm_observability.md';
const sharedTypePath = 'packages/shared/src/llm-observability.ts';
const packageIndexPath = 'packages/llm-observability/src/index.ts';
const packageJsonPath = 'package.json';

const migration = readFileSync(migrationPath, 'utf8');
const verification = readFileSync(verificationPath, 'utf8');
const doc = readFileSync(docPath, 'utf8');
const sharedType = readFileSync(sharedTypePath, 'utf8');
const packageIndex = readFileSync(packageIndexPath, 'utf8');
const packageJson = readFileSync(packageJsonPath, 'utf8');

const failures = [];

for (const field of [
  'tenant_id',
  'trace_id',
  'model_config_version_id',
  'prompt_version_id',
  'call_status',
  'input_tokens',
  'output_tokens',
  'total_tokens',
  'input_cost_per_million',
  'output_cost_per_million',
  'estimated_cost',
  'cost_currency',
  'latency_ms',
  'error_code',
  'budget_reason_code',
]) {
  if (!new RegExp(`\\b${field}\\b`).test(sharedType)) {
    failures.push(`${sharedTypePath} must define ${field}`);
  }
}

for (const contract of [
  'BEGIN;',
  'COMMIT;',
  'llm_call_logs_tenant_trace_fk',
  'llm_call_logs_tenant_model_config_fk',
  'GENERATED ALWAYS AS',
  'prevent_llm_call_log_mutation',
  'DROP DEFAULT',
  'llm_call_logs_provider_canonical_chk',
  'llm_call_logs_prompt_version_chk',
  'llm_call_logs_status_error_chk',
  'llm_call_logs_estimate_consistency_chk',
  'llm_call_logs_budget_reason_chk',
  'llm_cost_daily_by_tenant',
  'llm_cost_daily_by_ticket',
  "AT TIME ZONE 'UTC'",
]) {
  if (!migration.includes(contract)) {
    failures.push(`${migrationPath} must include ${contract}`);
  }
}

for (const assertion of [
  'generated total token count is incorrect',
  'tenant daily currency aggregation is incorrect',
  'cross-tenant trace reference was not rejected',
  'cross-tenant model config reference was not rejected',
  'failed call without error code was not rejected',
  'inconsistent estimated cost was not rejected',
  'append-only update was not rejected',
  'append-only delete was not rejected',
  'ROLLBACK;',
]) {
  if (!verification.includes(assertion)) {
    failures.push(`${verificationPath} must include ${assertion}`);
  }
}

for (const exportName of [
  'estimateLLMCallCost',
  'evaluateCostBudget',
  'createLLMCallLog',
  'LLMObservabilityValidationError',
]) {
  if (!packageIndex.includes(exportName)) {
    failures.push(`${packageIndexPath} must export ${exportName}`);
  }
}

for (const requirement of [
  'micro',
  'append-only',
  'currency',
  'model_config_version_id',
  'input_cost_per_million',
  'output_cost_per_million',
]) {
  if (!doc.includes(requirement)) {
    failures.push(`${docPath} must document ${requirement}`);
  }
}

for (const scriptName of [
  'test:phase1d',
  'test:llm-observability',
  'db:verify:llm-observability',
  '0003_llm_call_logging_cost_governance.sql',
]) {
  if (!packageJson.includes(scriptName)) {
    failures.push(`${packageJsonPath} must include ${scriptName}`);
  }
}

if (failures.length > 0) {
  console.error('Phase 1D validation failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Phase 1D validation passed');

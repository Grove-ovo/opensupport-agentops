import { existsSync, readFileSync } from 'node:fs';

const failures = [];
const required = [
  'apps/api/src/chatwoot-delivery.ts',
  'apps/api/src/chatwoot-routes.ts',
  'apps/api/src/e2e-repository.ts',
  'apps/api/src/e2e.test.ts',
  'apps/api/src/provider.test.ts',
  'apps/api/src/provider.ts',
  'apps/api/src/secrets.ts',
  'apps/api/src/ticket-service.ts',
  'docs/chatwoot_connector.md',
  'docs/database_schema.md',
  'docs/llm_runtime.md',
  'docs/local_runtime.md',
  'docs/trace_schema.md',
  'infra/migrations/0015_chatwoot_llm_e2e.sql',
  'infra/verification/phase6b_chatwoot_llm_e2e.sql',
];
for (const path of required) {
  if (!existsSync(path)) failures.push(`missing Phase 6B artifact: ${path}`);
}
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
for (const script of [
  'db:verify:phase6b',
  'test:phase6b',
  'test:e2e',
  'smoke:live',
]) {
  if (typeof packageJson.scripts?.[script] !== 'string') {
    failures.push(`missing root script: ${script}`);
  }
}
const migration = readFileSync(
  'infra/migrations/0015_chatwoot_llm_e2e.sql',
  'utf8',
);
for (const value of [
  'processing_status',
  'chatwoot_delivery_attempts',
  'runtime_execution_audits',
  'mock_orders',
]) {
  if (!migration.includes(value)) failures.push(`migration must include ${value}`);
}
const service = readFileSync('apps/api/src/ticket-service.ts', 'utf8');
for (const value of [
  'maskPII',
  'runAgentPipeline',
  'decideRuntimeMode',
  'claimCanonicalExecution',
  'appendLLMCallLog',
  'dedupeTtlSeconds',
  'masterKey.fill(0)',
  'webhook_signature_not_configured',
  'getActiveRuntimeConfig',
]) {
  if (!service.includes(value)) failures.push(`ticket service must include ${value}`);
}
if (service.includes('process.env.OPENAI_API_KEY')) {
  failures.push('ticket service must not use a global provider API key');
}
if (failures.length > 0) {
  console.error('Phase 6B validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 6B validation passed');

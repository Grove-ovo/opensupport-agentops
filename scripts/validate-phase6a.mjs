import { existsSync, readFileSync } from 'node:fs';

const failures = [];
const required = [
  'apps/api/package.json',
  'apps/api/tsconfig.json',
  'apps/api/src/app.ts',
  'apps/api/src/config.ts',
  'apps/api/src/contracts.ts',
  'apps/api/src/database.ts',
  'apps/api/src/metrics.ts',
  'apps/api/src/redis.ts',
  'apps/api/src/repositories.ts',
  'apps/api/src/runtime.ts',
  'apps/api/src/server.ts',
  'apps/api/src/app.test.ts',
  'apps/api/src/integration.test.ts',
  'infra/migrations/0014_productization_runtime.sql',
  'infra/verification/phase6a_productization_runtime.sql',
  'scripts/migrate.mjs',
];

for (const path of required) {
  if (!existsSync(path)) {
    failures.push(`missing Phase 6A artifact: ${path}`);
  }
}

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
for (const script of [
  'db:migrate',
  'db:verify:phase6a',
  'test:api',
  'test:api:integration',
  'test:phase6a',
]) {
  if (typeof packageJson.scripts?.[script] !== 'string') {
    failures.push(`missing root script: ${script}`);
  }
}

const migration = readFileSync(
  'infra/migrations/0014_productization_runtime.sql',
  'utf8',
);
for (const value of [
  'agentops_schema_migrations',
  'canonical_inbound_events',
  'async_job_outbox',
  'operational_aggregates',
  'UNIQUE (tenant_id, dedupe_key)',
]) {
  if (!migration.includes(value)) {
    failures.push(`Phase 6A migration must include ${value}`);
  }
}
if (migration.includes('raw_payload') || migration.includes('customer_text')) {
  failures.push('Phase 6A runtime tables must not persist raw customer payloads');
}

const apiSource = [
  'apps/api/src/app.ts',
  'apps/api/src/repositories.ts',
  'apps/api/src/redis.ts',
].map((path) => readFileSync(path, 'utf8')).join('\n');
for (const value of [
  '/health/live',
  '/health/ready',
  '/metrics',
  'claimDedupeKeys',
  'agentops_schema_migrations',
]) {
  if (!apiSource.includes(value)) {
    failures.push(`Phase 6A API must include ${value}`);
  }
}

if (failures.length > 0) {
  console.error('Phase 6A validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 6A validation passed');

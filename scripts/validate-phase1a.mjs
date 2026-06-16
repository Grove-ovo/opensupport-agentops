import { readFileSync } from 'node:fs';

const migrationPath = 'infra/migrations/0001_phase1_foundation.sql';
const runtimeDocPath = 'docs/local_runtime.md';
const schemaDocPath = 'docs/database_schema.md';

const migration = readFileSync(migrationPath, 'utf8');
const runtimeDoc = readFileSync(runtimeDocPath, 'utf8');
const schemaDoc = readFileSync(schemaDocPath, 'utf8');

const requiredTables = [
  'tenants',
  'chatwoot_connections',
  'tenant_model_configs',
  'agent_traces',
  'llm_call_logs',
  'audit_logs',
];

const forbiddenTables = [
  'users',
  'accounts',
  'rbac',
  'policy_documents',
  'tool_calls',
  'approval_requests',
  'eval_runs',
  'release_candidates',
];

const requiredTraceSnapshotFields = [
  'agent_version_id',
  'prompt_version_id',
  'policy_version_id',
  'tool_manifest_version_id',
  'risk_rule_version_id',
  'retrieval_config_version_id',
  'model_config_version_id',
];

const requiredModelConfigFields = [
  'provider',
  'fast_model',
  'strong_model',
  'embedding_model',
  'fallback_model',
  'timeout_ms',
  'max_cost_per_ticket',
  'daily_budget',
  'encrypted_api_key_ref',
];

const failures = [];

for (const table of requiredTables) {
  const createTablePattern = new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${table}\\s*\\(`, 'i');
  if (!createTablePattern.test(migration)) {
    failures.push(`${migrationPath} must create ${table}`);
  }
  if (!schemaDoc.includes(`### ${table}`)) {
    failures.push(`${schemaDocPath} must document ${table}`);
  }
}

for (const table of requiredTables.filter((table) => table !== 'tenants')) {
  const tableBlock = extractCreateTableBlock(migration, table);
  if (!/\btenant_id\b/i.test(tableBlock)) {
    failures.push(`${table} must include tenant_id ownership`);
  }
}

for (const table of forbiddenTables) {
  const createTablePattern = new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${table}\\s*\\(`, 'i');
  if (createTablePattern.test(migration)) {
    failures.push(`${migrationPath} must not create deferred table ${table}`);
  }
}

for (const field of requiredTraceSnapshotFields) {
  if (!new RegExp(`\\b${field}\\b`, 'i').test(migration)) {
    failures.push(`agent_traces must include ${field}`);
  }
}

for (const field of requiredModelConfigFields) {
  if (!new RegExp(`\\b${field}\\b`, 'i').test(migration)) {
    failures.push(`tenant_model_configs must include ${field}`);
  }
}

for (const value of ['DATABASE_URL', 'REDIS_URL', 'npm run db:up', 'npm run db:migrate', 'npm run db:verify']) {
  if (!runtimeDoc.includes(value)) {
    failures.push(`${runtimeDocPath} must mention ${value}`);
  }
}

if (!runtimeDoc.includes('does not implement') || !schemaDoc.includes('Deferred Tables')) {
  failures.push('Phase 1A docs must state deferred scope explicitly');
}

if (failures.length > 0) {
  console.error('Phase 1A validation failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Phase 1A validation passed');

function extractCreateTableBlock(sql, tableName) {
  const startPattern = new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${tableName}\\s*\\(`, 'i');
  const match = startPattern.exec(sql);
  if (!match) {
    return '';
  }

  const start = match.index;
  const nextTableIndex = sql.slice(start + 1).search(/CREATE TABLE IF NOT EXISTS\s+/i);
  if (nextTableIndex === -1) {
    return sql.slice(start);
  }

  return sql.slice(start, start + 1 + nextTableIndex);
}

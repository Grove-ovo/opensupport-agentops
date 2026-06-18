import { readFileSync } from 'node:fs';

const migrationPath = 'infra/migrations/0004_pii_mask_trace_schema.sql';
const verificationPath = 'infra/verification/phase1e_trace_schema.sql';
const docPath = 'docs/trace_schema.md';
const sharedPiiPath = 'packages/shared/src/pii.ts';
const sharedTracePath = 'packages/shared/src/trace.ts';
const piiIndexPath = 'packages/pii/src/index.ts';
const traceIndexPath = 'packages/trace/src/index.ts';
const packageJsonPath = 'package.json';

const migration = readFileSync(migrationPath, 'utf8');
const verification = readFileSync(verificationPath, 'utf8');
const doc = readFileSync(docPath, 'utf8');
const sharedPii = readFileSync(sharedPiiPath, 'utf8');
const sharedTrace = readFileSync(sharedTracePath, 'utf8');
const piiIndex = readFileSync(piiIndexPath, 'utf8');
const traceIndex = readFileSync(traceIndexPath, 'utf8');
const packageJson = readFileSync(packageJsonPath, 'utf8');

const failures = [];

for (const category of [
  'email',
  'phone',
  'address',
  'id_number',
  'bank_card',
]) {
  if (!sharedPii.includes(`'${category}'`)) {
    failures.push(`${sharedPiiPath} must define ${category}`);
  }
}

for (const field of [
  'masked_text',
  'detected_categories',
  'replacement_map_ref',
  'original_value',
]) {
  if (!new RegExp(`\\b${field}\\b`).test(sharedPii)) {
    failures.push(`${sharedPiiPath} must define ${field}`);
  }
}

for (const field of [
  'trace_id',
  'tenant_id',
  'ticket_id',
  'conversation_id',
  'message_id',
  'runtime_mode',
  'execution_state',
  'agent_version_id',
  'prompt_version_id',
  'policy_version_id',
  'tool_manifest_version_id',
  'risk_rule_version_id',
  'retrieval_config_version_id',
  'model_config_version_id',
  'pii_categories',
  'pii_replacement_map_ref',
  'masked_input_hash',
]) {
  if (!new RegExp(`\\b${field}\\b`).test(sharedTrace)) {
    failures.push(`${sharedTracePath} must define ${field}`);
  }
}

for (const state of [
  'received',
  'normalized',
  'planned',
  'waiting_tool',
  'waiting_approval',
  'replied',
  'private_noted',
  'handed_off',
  'failed',
]) {
  if (!sharedTrace.includes(`'${state}'`)) {
    failures.push(`${sharedTracePath} must define execution state ${state}`);
  }
}

for (const contract of [
  'BEGIN;',
  'COMMIT;',
  'existing agent traces require version, execution, and PII audit backfill',
  'agent_traces_tenant_model_config_fk',
  'agent_traces_execution_state_chk',
  'agent_traces_version_snapshot_chk',
  'agent_traces_pii_categories_chk',
  'agent_traces_pii_reference_chk',
  'agent_traces_masked_input_hash_chk',
  'agent_traces_entities_object_chk',
  'prevent_agent_trace_snapshot_mutation',
]) {
  if (!migration.includes(contract)) {
    failures.push(`${migrationPath} must include ${contract}`);
  }
}

for (const assertion of [
  'operational trace update did not succeed',
  'immutable trace snapshot update was not rejected',
  'cross-tenant model config reference was not rejected',
  'duplicate PII categories were not rejected',
  'invalid trace JSON shape was not rejected',
  'invalid masked input hash was not rejected',
  'ROLLBACK;',
]) {
  if (!verification.includes(assertion)) {
    failures.push(`${verificationPath} must include ${assertion}`);
  }
}

if (!piiIndex.includes('maskPII')) {
  failures.push(`${piiIndexPath} must export maskPII`);
}

for (const exportName of ['createAgentTrace', 'TraceValidationError']) {
  if (!traceIndex.includes(exportName)) {
    failures.push(`${traceIndexPath} must export ${exportName}`);
  }
}

for (const requirement of [
  'replacement map',
  'order ID',
  'masked_input_hash',
  'immutable',
  'TicketExecution',
  'model_config_version_id',
]) {
  if (!doc.includes(requirement)) {
    failures.push(`${docPath} must document ${requirement}`);
  }
}

for (const scriptName of [
  'test:phase1e',
  'test:pii',
  'test:trace',
  'db:verify:trace',
  '0004_pii_mask_trace_schema.sql',
]) {
  if (!packageJson.includes(scriptName)) {
    failures.push(`${packageJsonPath} must include ${scriptName}`);
  }
}

if (failures.length > 0) {
  console.error('Phase 1E validation failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Phase 1E validation passed');

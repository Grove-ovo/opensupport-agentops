import { existsSync, readFileSync } from 'node:fs';

const required = [
  'packages/shared/src/response.ts',
  'packages/agent-runtime/src/runtime.ts',
  'packages/agent-runtime/src/agent-runtime.test.ts',
  'docs/agent_runtime.md',
  '.trellis/spec/agent/phase-2g-agent-runtime.md',
  'scripts/validate-phase2.mjs',
];
const failures = [];
for (const path of required) {
  if (!existsSync(path)) failures.push(`missing Phase 2G artifact: ${path}`);
}
const runtime = read('packages/agent-runtime/src/runtime.ts');
const shared = read('packages/shared/src/response.ts');
const pkg = read('package.json');
for (const value of [
  'runAgentPipeline',
  'routeAgentMessage',
  'evaluateRiskGuardrails',
  'groundingFailureReason',
  'selectResponseModel',
  'fallback_model',
]) {
  if (!runtime.includes(value)) failures.push(`runtime must include ${value}`);
}
for (const value of [
  'delivery_performed: false',
  'approval_created: false',
  'PipelineTraceAppend',
]) {
  if (!shared.includes(value)) failures.push(`response contract must include ${value}`);
}
for (const forbidden of ['@opensupport/chatwoot', 'approval_requests']) {
  if (runtime.includes(forbidden)) failures.push(`runtime must not include ${forbidden}`);
}
for (const value of ['test:phase2', 'test:phase2g', 'test:agent-runtime']) {
  if (!pkg.includes(value)) failures.push(`package.json must include ${value}`);
}
if (failures.length) {
  console.error('Phase 2G validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 2G validation passed');

function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

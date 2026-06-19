import { existsSync, readFileSync } from 'node:fs';

const paths = [
  'packages/llm-runtime/src/runtime.ts',
  'packages/llm-runtime/src/triage.ts',
  'packages/llm-runtime/src/index.ts',
  'docs/llm_runtime.md',
];
const failures = [];
for (const path of paths) {
  if (!existsSync(path)) failures.push(`missing Phase 2B artifact: ${path}`);
}
const runtime = read('packages/llm-runtime/src/runtime.ts');
const triage = read('packages/llm-runtime/src/triage.ts');
const index = read('packages/llm-runtime/src/index.ts');
const pkg = read('package.json');
for (const value of [
  'decryptApiKey',
  'evaluateCostBudget',
  'createLLMCallLog',
  'fallback_model',
  'model_config_mismatch',
]) {
  if (!runtime.includes(value)) failures.push(`runtime must include ${value}`);
}
for (const value of ['triage_required', 'TriageDecision', 'masked_customer_text']) {
  if (!triage.includes(value)) failures.push(`triage must include ${value}`);
}
for (const value of ['invokeTenantModel', 'runConditionalTriage']) {
  if (!index.includes(value)) failures.push(`index must export ${value}`);
}
for (const value of ['test:phase2b', 'test:llm-runtime']) {
  if (!pkg.includes(value)) failures.push(`package.json must include ${value}`);
}
if (failures.length) {
  console.error('Phase 2B validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 2B validation passed');
function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

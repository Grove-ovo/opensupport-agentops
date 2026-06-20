import { existsSync, readFileSync } from 'node:fs';

const required = [
  'packages/eval/src/selective-adapters.ts',
  'packages/eval/src/selective-adapters.test.ts',
  '.trellis/spec/agent/phase-5c-selective-adapters.md',
  'docs/benchmark_framework.md',
];
const failures = required
  .filter((path) => !existsSync(path))
  .map((path) => `missing Phase 5C artifact: ${path}`);

const source = read('packages/eval/src/selective-adapters.ts');
for (const value of [
  'V2RagToolsBenchmarkAdapter',
  'V3SelectivePipelineBenchmarkAdapter',
  'v2_rag_tools',
  'v3_selective_pipeline',
  'runAgentPipeline',
  'external_side_effect',
]) {
  if (!source.includes(value)) {
    failures.push(`selective adapters must include ${value}`);
  }
}
for (const forbidden of [
  '@opensupport/chatwoot',
  '@opensupport/approvals',
  '@opensupport/runtime-orchestrator',
  '@opensupport/tools',
  'node:fs',
]) {
  if (source.includes(forbidden)) {
    failures.push(`selective adapters must not import ${forbidden}`);
  }
}

if (failures.length > 0) {
  console.error('Phase 5C validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 5C validation passed');

function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

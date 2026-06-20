import { existsSync, readFileSync } from 'node:fs';

const required = [
  'packages/eval/src/reference-adapters.ts',
  'packages/eval/src/reference-adapters.test.ts',
  '.trellis/spec/agent/phase-5b-reference-adapters.md',
  'docs/benchmark_framework.md',
];
const failures = required
  .filter((path) => !existsSync(path))
  .map((path) => `missing Phase 5B artifact: ${path}`);

const source = read('packages/eval/src/reference-adapters.ts');
for (const value of [
  'V0SuperAgentBenchmarkAdapter',
  'V1RagOnlyBenchmarkAdapter',
  'v0_super_agent',
  'v1_rag_only',
  'unsupported_variant',
  'scope_mismatch',
]) {
  if (!source.includes(value)) {
    failures.push(`reference adapters must include ${value}`);
  }
}
for (const forbidden of [
  '@opensupport/chatwoot',
  '@opensupport/approvals',
  '@opensupport/tools',
  '@opensupport/llm-runtime',
  '@opensupport/agent-runtime',
  'node:fs',
]) {
  if (source.includes(forbidden)) {
    failures.push(`reference adapters must not import ${forbidden}`);
  }
}

if (failures.length > 0) {
  console.error('Phase 5B validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 5B validation passed');

function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

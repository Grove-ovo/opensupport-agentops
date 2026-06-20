import { existsSync, readFileSync } from 'node:fs';

const required = [
  'packages/shared/src/benchmark.ts',
  'packages/eval/src/benchmark.ts',
  'packages/eval/src/benchmark.test.ts',
  '.trellis/spec/agent/phase-5a-benchmark-contracts.md',
  'docs/benchmark_framework.md',
];
const failures = required
  .filter((path) => !existsSync(path))
  .map((path) => `missing Phase 5A artifact: ${path}`);

const source = read('packages/eval/src/benchmark.ts');
for (const value of [
  'task_success_rate',
  'retrieval_recall_at_5',
  'tool_call_accuracy',
  'unsafe_action_rate',
  'no_evidence_answer_rate',
  'human_edit_rate',
  'p95_latency_ms',
  'average_cost_per_ticket',
  'idempotency_conflict',
  'executor_failed',
]) {
  if (!source.includes(value)) {
    failures.push(`benchmark runner must include ${value}`);
  }
}
for (const forbidden of [
  '@opensupport/chatwoot',
  '@opensupport/approvals',
  '@opensupport/tools',
  '@opensupport/llm-runtime',
]) {
  if (source.includes(forbidden)) {
    failures.push(`benchmark runner must not import ${forbidden}`);
  }
}

const shared = read('packages/shared/src/benchmark.ts');
for (const variant of [
  'v0_super_agent',
  'v1_rag_only',
  'v2_rag_tools',
  'v3_selective_pipeline',
]) {
  if (!shared.includes(variant)) {
    failures.push(`shared benchmark contract must include ${variant}`);
  }
}

if (failures.length > 0) {
  console.error('Phase 5A validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 5A validation passed');

function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

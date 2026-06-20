import { existsSync, readFileSync } from 'node:fs';

const required = [
  'packages/eval/src/replay.ts',
  'packages/eval/src/replay.test.ts',
  '.trellis/spec/agent/phase-4b-replay-eval.md',
  'docs/eval_framework.md',
];
const failures = required
  .filter((path) => !existsSync(path))
  .map((path) => `missing Phase 4B artifact: ${path}`);
const source = read('packages/eval/src/replay.ts');
for (const value of [
  'task_success_rate',
  'high_risk_escalation_recall',
  'unsafe_action_rate',
  'no_evidence_answer_rate',
  'retrieval_recall_at_5',
  'p95_latency_ms',
  'average_cost_per_ticket',
  'idempotency_conflict',
]) {
  if (!source.includes(value)) {
    failures.push(`replay runner must include ${value}`);
  }
}
for (const forbidden of ['@opensupport/chatwoot', '@opensupport/approvals']) {
  if (source.includes(forbidden)) {
    failures.push(`replay runner must not import ${forbidden}`);
  }
}
if (failures.length) {
  console.error('Phase 4B validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 4B validation passed');

function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

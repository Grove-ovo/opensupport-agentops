import { existsSync, readFileSync } from 'node:fs';

const required = [
  'packages/shared/src/risk.ts',
  'packages/guardrails/src/guardrails.ts',
  'packages/guardrails/src/guardrails.test.ts',
  'docs/risk_guardrail.md',
  '.trellis/spec/agent/phase-2f-risk-guardrail.md',
];
const failures = [];
for (const path of required) {
  if (!existsSync(path)) failures.push(`missing Phase 2F artifact: ${path}`);
}
const shared = read('packages/shared/src/risk.ts');
const guardrails = read('packages/guardrails/src/guardrails.ts');
const pkg = read('package.json');
for (const value of [
  'gate_name',
  'decision',
  'reason_code',
  'severity',
  'blocking',
]) {
  if (!shared.includes(value)) failures.push(`GateDecision must include ${value}`);
}
for (const value of [
  'prompt_injection',
  'approval_bypass',
  'unauthorized_order_access',
  'retrieval_conflict',
  'unsafe_tool_intent',
  'pii_leak',
]) {
  if (!guardrails.includes(value)) failures.push(`guardrails must include ${value}`);
}
for (const value of ['test:phase2f', 'test:guardrails']) {
  if (!pkg.includes(value)) failures.push(`package.json must include ${value}`);
}
if (failures.length) {
  console.error('Phase 2F validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 2F validation passed');

function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

import { existsSync, readFileSync } from 'node:fs';

const required = [
  'packages/shared/src/runtime-control.ts',
  'packages/runtime-control/src/transition.ts',
  'packages/runtime-control/src/runtime-control.test.ts',
  'infra/migrations/0006_ticket_execution_state_machine.sql',
  'infra/verification/phase3a_ticket_execution_state_machine.sql',
  'docs/runtime_modes.md',
  '.trellis/spec/infra/phase-3a-ticket-execution-state-machine.md',
];
const failures = [];
for (const path of required) {
  if (!existsSync(path)) failures.push(`missing Phase 3A artifact: ${path}`);
}

const shared = read('packages/shared/src/runtime-control.ts');
const runtime = read('packages/runtime-control/src/transition.ts');
const migration = read(
  'infra/migrations/0006_ticket_execution_state_machine.sql',
);
const verification = read(
  'infra/verification/phase3a_ticket_execution_state_machine.sql',
);
const pkg = read('package.json');

for (const value of [
  'TicketExecutionTransitionCommand',
  'TicketExecutionTransition',
  'TicketExecutionTransitionResult',
  'TicketExecutionReasonCode',
]) {
  if (!shared.includes(value)) failures.push(`shared contract must include ${value}`);
}
for (const value of [
  'TICKET_EXECUTION_TRANSITIONS',
  'applyTicketExecutionTransition',
  'MemoryTicketExecutionStateMachine',
  'idempotency_conflict',
  'terminal_state',
]) {
  if (!runtime.includes(value)) failures.push(`runtime control must include ${value}`);
}
for (const value of [
  'ticket_execution_transitions',
  'is_ticket_execution_transition_allowed',
  'guard_agent_trace_execution_transition',
  'transition_ticket_execution',
  'opensupport.transition_id',
  'append-only',
]) {
  if (!migration.includes(value)) failures.push(`migration must include ${value}`);
}
for (const value of [
  'direct execution state update was not rejected',
  'valid transition did not create exactly one audit row',
  'idempotent retry did not return the original transition',
  'transition audit mutation was not rejected',
]) {
  if (!verification.includes(value)) {
    failures.push(`live verification must include ${value}`);
  }
}
for (const value of [
  'test:phase3a',
  'test:runtime-control',
  'db:verify:runtime-control',
  '0006_ticket_execution_state_machine.sql',
]) {
  if (!pkg.includes(value)) failures.push(`package.json must include ${value}`);
}
for (const forbidden of [
  '@opensupport/chatwoot',
  'approval_requests',
  'delivery_performed',
]) {
  if (runtime.includes(forbidden)) {
    failures.push(`Phase 3A runtime must not include ${forbidden}`);
  }
}

if (failures.length > 0) {
  console.error('Phase 3A validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 3A validation passed');

function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

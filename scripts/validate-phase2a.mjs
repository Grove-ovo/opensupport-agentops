import { existsSync, readFileSync } from 'node:fs';

const sharedPath = 'packages/shared/src/agent.ts';
const sharedIndexPath = 'packages/shared/src/index.ts';
const packageIndexPath = 'packages/agent-core/src/index.ts';
const routerPath = 'packages/agent-core/src/router.ts';
const docPath = 'docs/agent_pipeline.md';
const packageJsonPath = 'package.json';
const tsconfigPath = 'tsconfig.json';

const requiredPaths = [
  sharedPath,
  sharedIndexPath,
  packageIndexPath,
  routerPath,
  docPath,
  'packages/agent-core/package.json',
  'packages/agent-core/tsconfig.json',
  '.trellis/spec/agent/index.md',
  '.trellis/spec/agent/phase-2a-agent-pipeline-code-router.md',
];
const failures = [];

for (const path of requiredPaths) {
  if (!existsSync(path)) {
    failures.push(`required Phase 2A artifact is missing: ${path}`);
  }
}

const shared = read(sharedPath);
const sharedIndex = read(sharedIndexPath);
const packageIndex = read(packageIndexPath);
const router = read(routerPath);
const doc = read(docPath);
const packageJson = read(packageJsonPath);
const tsconfig = read(tsconfigPath);

for (const contract of [
  'AgentPipelineContext',
  'RouteDecision',
  'PipelineStepResult',
  'candidate_intents',
  'required_capabilities',
  'sensitive_signals',
  'triage_required',
]) {
  if (!shared.includes(contract)) {
    failures.push(`${sharedPath} must define ${contract}`);
  }
}

for (const intent of [
  'order_status',
  'logistics_query',
  'refund_eligibility',
  'refund_request',
  'return_policy',
  'invoice_request',
  'complaint_escalation',
  'unknown',
]) {
  if (!shared.includes(`'${intent}'`)) {
    failures.push(`${sharedPath} must define intent ${intent}`);
  }
}

for (const exportName of [
  'createAgentPipelineContext',
  'routeAgentMessage',
  'AgentCoreValidationError',
]) {
  if (!packageIndex.includes(exportName)) {
    failures.push(`${packageIndexPath} must export ${exportName}`);
  }
}

if (!sharedIndex.includes("from './agent.js'")) {
  failures.push(`${sharedIndexPath} must export the Agent contracts`);
}

for (const forbidden of [
  'fetch(',
  'node:http',
  'node:https',
  "from 'pg'",
  'postgres',
  'openai',
]) {
  if (router.toLowerCase().includes(forbidden.toLowerCase())) {
    failures.push(`${routerPath} must remain deterministic and local: ${forbidden}`);
  }
}

for (const requirement of [
  'Routing Precedence',
  'Sensitive Signals',
  'masked_text',
  'conditional triage',
  'AgentCoreValidationError',
]) {
  if (!doc.includes(requirement)) {
    failures.push(`${docPath} must document ${requirement}`);
  }
}

if (!read('.trellis/spec/agent/index.md').includes('Phase 2A Agent Pipeline')) {
  failures.push(
    '.trellis/spec/agent/index.md must link the Phase 2A Agent code-spec',
  );
}

for (const scriptName of [
  'test:phase2a',
  'test:agent-core',
  'packages/agent-core/dist/*.test.js',
]) {
  if (!packageJson.includes(scriptName)) {
    failures.push(`${packageJsonPath} must include ${scriptName}`);
  }
}

if (!tsconfig.includes('./packages/agent-core')) {
  failures.push(`${tsconfigPath} must reference packages/agent-core`);
}

if (failures.length > 0) {
  console.error('Phase 2A validation failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Phase 2A validation passed');

function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

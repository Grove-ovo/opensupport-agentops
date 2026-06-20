import { existsSync, readFileSync } from 'node:fs';

const children = [
  '06-18-phase-2a-agent-pipeline-code-router',
  '06-18-phase-2b-llm-runtime-conditional-triage',
  '06-18-phase-2c-policy-corpus-hybrid-retrieval',
  '06-18-phase-2d-rag-evidence-baseline',
  '06-18-phase-2e-tool-contracts-mock-services',
  '06-18-phase-2f-risk-guardrail',
  '06-18-phase-2g-response-agent-integration',
];
const requiredArtifacts = [
  'docs/agent_pipeline.md',
  'docs/llm_runtime.md',
  'docs/policy_retrieval.md',
  'docs/rag_pipeline.md',
  'docs/tool_contract.md',
  'docs/risk_guardrail.md',
  'docs/agent_runtime.md',
  'reports/rag_eval_baseline.md',
];
const failures = [];
for (const path of requiredArtifacts) {
  if (!existsSync(path)) failures.push(`missing Phase 2 artifact: ${path}`);
}
const parentPath = resolveTask('06-18-phase-2-agent-rag-tools');
const parent = readJson(parentPath);
if (parentPath === null) {
  failures.push('missing Phase 2 parent task');
}
if (JSON.stringify(parent?.children) !== JSON.stringify(children)) {
  failures.push('Phase 2 parent must retain children in dependency order');
}
if (!['in_progress', 'completed'].includes(parent?.status)) {
  failures.push('Phase 2 parent must be in progress or completed');
}
for (const child of children) {
  const taskPath = resolveTask(child);
  if (taskPath === null) {
    failures.push(`missing Phase 2 child task: ${child}`);
    continue;
  }
  const task = readJson(taskPath);
  const allowed = ['completed'];
  if (!allowed.includes(task?.status)) {
    failures.push(`${child} must have status ${allowed.join(' or ')}`);
  }
  if (task?.parent !== '06-18-phase-2-agent-rag-tools') {
    failures.push(`${child} must remain linked to the Phase 2 parent`);
  }
}
if (failures.length) {
  console.error('Phase 2 integration validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 2 integration validation passed');

function resolveTask(slug) {
  const active = `.trellis/tasks/${slug}/task.json`;
  const archived = `.trellis/tasks/archive/2026-06/${slug}/task.json`;
  if (existsSync(active)) return active;
  if (existsSync(archived)) return archived;
  return null;
}

function readJson(path) {
  if (path === null || !existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, 'utf8'));
}

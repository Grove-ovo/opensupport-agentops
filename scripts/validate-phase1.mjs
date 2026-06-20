import { existsSync, readFileSync } from 'node:fs';

const packageJsonPath = 'package.json';
const parentPrdPath =
  '.trellis/tasks/archive/2026-06/06-16-opensupport-agentops-architecture/prd.md';
const parentTaskPath =
  '.trellis/tasks/archive/2026-06/06-16-opensupport-agentops-architecture/task.json';
const parentTaskSlug = '06-16-opensupport-agentops-architecture';

const requiredMigrations = [
  'infra/migrations/0001_phase1_foundation.sql',
  'infra/migrations/0002_tenant_model_config_versions.sql',
  'infra/migrations/0003_llm_call_logging_cost_governance.sql',
  'infra/migrations/0004_pii_mask_trace_schema.sql',
];

const requiredArtifacts = [
  'infra/docker/compose.phase1.yml',
  'infra/verification/phase1c_tenant_model_config.sql',
  'infra/verification/phase1d_llm_observability.sql',
  'infra/verification/phase1e_trace_schema.sql',
  'docs/chatwoot_connector.md',
  'docs/tenant_model_config.md',
  'docs/llm_observability.md',
  'docs/trace_schema.md',
  'packages/chatwoot/src/index.ts',
  'packages/model-config/src/index.ts',
  'packages/llm-observability/src/index.ts',
  'packages/pii/src/index.ts',
  'packages/trace/src/index.ts',
  'scripts/validate-phase1a.mjs',
  'scripts/validate-phase1c.mjs',
  'scripts/validate-phase1d.mjs',
  'scripts/validate-phase1e.mjs',
  '.trellis/spec/infra/phase-1-foundation-integration.md',
  parentPrdPath,
  parentTaskPath,
];

const childTaskSlugs = [
  '06-16-phase-1a-local-runtime-database-foundation',
  '06-16-phase-1b-chatwoot-connector',
  '06-16-phase-1c-tenant-byok-model-config',
  '06-16-phase-1d-llm-call-logging-cost-governance',
  '06-16-phase-1e-pii-mask-trace-schema',
];

const requiredTestCommands = [
  'npm run test:phase1',
  'npm run test:phase1a',
  'npm run test:phase1c',
  'npm run test:phase1d',
  'npm run test:phase1e',
  'npm run test:chatwoot',
  'npm run test:model-config',
  'npm run test:llm-observability',
  'npm run test:pii',
  'npm run test:trace',
];

const failures = [];

for (const path of [...requiredMigrations, ...requiredArtifacts]) {
  if (!existsSync(path)) {
    failures.push(`required Phase 1 artifact is missing: ${path}`);
  }
}

const packageJson = readJson(packageJsonPath);
const scripts = packageJson?.scripts ?? {};

if (scripts['test:phase1'] !== 'node scripts/validate-phase1.mjs') {
  failures.push(
    `${packageJsonPath} must define test:phase1 as node scripts/validate-phase1.mjs`,
  );
}

validateOrderedEntries(
  scripts['db:migrate'],
  requiredMigrations,
  'db:migrate',
);
validateOrderedEntries(scripts.test, requiredTestCommands, 'test');

const parentTask = readJson(parentTaskPath);
if (
  !Array.isArray(parentTask?.children) ||
  JSON.stringify(parentTask.children) !== JSON.stringify(childTaskSlugs)
) {
  failures.push(
    `${parentTaskPath} must link Phase 1A through Phase 1E in delivery order`,
  );
}

for (const slug of childTaskSlugs) {
  const taskPath = `.trellis/tasks/archive/2026-06/${slug}/task.json`;
  if (!existsSync(taskPath)) {
    failures.push(`completed child task archive is missing: ${taskPath}`);
    continue;
  }

  const task = readJson(taskPath);
  if (task?.status !== 'completed') {
    failures.push(`${taskPath} must have status=completed`);
  }
  if (task?.parent !== parentTaskSlug) {
    failures.push(`${taskPath} must remain linked to ${parentTaskSlug}`);
  }
}

if (existsSync(parentPrdPath)) {
  const parentPrd = readFileSync(parentPrdPath, 'utf8');

  for (const requiredText of [
    'Phase 1 Foundation Integration',
    'User registration API.',
    'Phase 2: Agent + RAG + Tools',
    'Phase 3: Runtime Modes + Approval',
    'Phase 4: Eval + Release Gate',
    'Phase 5: Benchmark + Load Test',
    'Phase 1A through Phase 1E Trellis children are archived as',
  ]) {
    if (!parentPrd.includes(requiredText)) {
      failures.push(`${parentPrdPath} must retain: ${requiredText}`);
    }
  }
}

if (failures.length > 0) {
  console.error('Phase 1 integration validation failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Phase 1 integration validation passed');

function readJson(path) {
  if (!existsSync(path)) {
    return undefined;
  }

  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    failures.push(
      `${path} must contain valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return undefined;
  }
}

function validateOrderedEntries(value, entries, scriptName) {
  if (typeof value !== 'string') {
    failures.push(`${packageJsonPath} must define the ${scriptName} script`);
    return;
  }

  let previousIndex = -1;
  for (const entry of entries) {
    const index = value.indexOf(entry);
    if (index === -1) {
      failures.push(`${scriptName} must include ${entry}`);
      continue;
    }
    if (index <= previousIndex) {
      failures.push(`${scriptName} must keep ${entry} in the required order`);
    }
    previousIndex = index;
  }
}

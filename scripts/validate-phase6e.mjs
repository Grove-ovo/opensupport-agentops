import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const requiredFiles = [
  'infra/docker/Dockerfile.api',
  'infra/docker/Dockerfile.worker',
  'infra/docker/Dockerfile.web',
  'infra/docker/compose.production.yml',
  'infra/docker/compose.ci-smoke.yml',
  'infra/docker/nginx.conf',
  'infra/observability/prometheus.yml',
  'infra/observability/alerts.yml',
  'infra/observability/grafana/provisioning/datasources/prometheus.yml',
  'infra/observability/grafana/provisioning/dashboards/dashboards.yml',
  'infra/observability/grafana/dashboards/agentops-overview.json',
  'scripts/production-smoke.mjs',
  'scripts/ci-compose-core-boot.sh',
  'scripts/ops/backup.sh',
  'scripts/ops/restore.sh',
  'docs/operations/deployment-runbook.md',
  'docs/operations/backup-restore.md',
  'docs/operations/incident-response.md',
  'docs/operations/credential-rotation.md',
];

await Promise.all(requiredFiles.map((file) => readFile(file, 'utf8')));

const compose = await readFile('infra/docker/compose.production.yml', 'utf8');
const ciSmokeCompose = await readFile(
  'infra/docker/compose.ci-smoke.yml',
  'utf8',
);
const nginx = await readFile('infra/docker/nginx.conf', 'utf8');
const apiDockerfile = await readFile('infra/docker/Dockerfile.api', 'utf8');
const workerDockerfile = await readFile(
  'infra/docker/Dockerfile.worker',
  'utf8',
);
const webDockerfile = await readFile('infra/docker/Dockerfile.web', 'utf8');
const apiLog = await readFile('apps/api/src/structured-log.ts', 'utf8');
const workerLog = await readFile('apps/worker/src/structured-log.ts', 'utf8');
const deployment = await readFile(
  'docs/operations/deployment-runbook.md',
  'utf8',
);
const ciWorkflow = await readFile('.github/workflows/ci.yml', 'utf8');
const ciCoreBoot = await readFile('scripts/ci-compose-core-boot.sh', 'utf8');

for (const service of [
  'postgres:',
  'redis:',
  'migrate:',
  'api:',
  'worker:',
  'web:',
  'prometheus:',
  'grafana:',
]) {
  assert.match(compose, new RegExp(`^  ${service}`, 'm'));
}
assert.match(compose, /condition: service_completed_successfully/);
assert.match(compose, /agentops_master_key:/);
assert.match(compose, /no-new-privileges:true/);
assert.match(compose, /GF_PLUGINS_PREINSTALL: ""/);
assert.match(compose, /outbound:/);
assert.match(compose, /management:/);
assert.match(ciSmokeCompose, /smoke-mock:/);
assert.match(ciSmokeCompose, /http:\/\/smoke-mock:18090/);
assert.match(ciSmokeCompose, /SMOKE_OIDC_PUBLIC_ISSUER/);
assert.match(nginx, /location \/api\//);
assert.match(nginx, /location \/worker\/health\//);
for (const dockerfile of [apiDockerfile, workerDockerfile, webDockerfile]) {
  assert.match(dockerfile, /FROM .+ AS build/);
}
assert.match(apiLog, /JSON\.stringify/);
assert.match(workerLog, /JSON\.stringify/);
assert.match(apiLog, /build_version/);
assert.match(workerLog, /build_version/);
assert.match(deployment, /## Rollback/);
assert.match(deployment, /npm run smoke:production/);
assert.doesNotMatch(ciWorkflow, /Boot complete production stack/);
assert.match(ciWorkflow, /Boot production core stack/);
assert.match(ciWorkflow, /bash scripts\/ci-compose-core-boot\.sh/);
assert.match(ciWorkflow, /compose\.ci-smoke\.yml/);
assert.match(ciWorkflow, /up -d --wait --wait-timeout 120 smoke-mock/);
assert.match(ciCoreBoot, /wait_healthy postgres/);
assert.match(ciCoreBoot, /wait_completed migrate/);
assert.match(ciCoreBoot, /wait_healthy api/);
assert.match(ciCoreBoot, /wait_healthy worker/);
assert.match(ciCoreBoot, /wait_healthy web/);
assert.match(ciCoreBoot, /up -d --build --no-deps migrate/);
assert.match(ciCoreBoot, /up -d --build --no-deps api worker/);
assert.match(ciCoreBoot, /up -d --build --no-deps web/);
assert.match(ciWorkflow, /Boot production observability stack/);
assert.match(
  ciWorkflow,
  /up -d --no-deps --wait --wait-timeout 240 prometheus grafana/,
);

const coreBootIndex = ciWorkflow.indexOf('Boot production core stack');
const smokeIndex = ciWorkflow.indexOf('Run authenticated production smoke');
const observabilityBootIndex = ciWorkflow.indexOf(
  'Boot production observability stack',
);
const observabilityVerifyIndex = ciWorkflow.indexOf(
  'Verify Prometheus and Grafana provisioning',
);
assert.ok(coreBootIndex > -1 && coreBootIndex < smokeIndex);
assert.ok(observabilityBootIndex > smokeIndex);
assert.ok(observabilityBootIndex < observabilityVerifyIndex);

console.log('Phase 6E production operations structure validated.');

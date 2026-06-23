import { readFile } from 'node:fs/promises';

const prometheusUrl =
  process.env.AGENTOPS_PROMETHEUS_URL ?? 'http://127.0.0.1:9090';
const grafanaUrl =
  process.env.AGENTOPS_GRAFANA_URL ?? 'http://127.0.0.1:3001';
const grafanaUser = process.env.GRAFANA_ADMIN_USER ?? 'agentops-ci';
const grafanaPasswordFile =
  process.env.GRAFANA_ADMIN_PASSWORD_FILE ??
  'secrets/grafana_admin_password';
const password = (await readFile(grafanaPasswordFile, 'utf8')).trim();
const authorization = `Basic ${Buffer.from(`${grafanaUser}:${password}`).toString('base64')}`;

const targets = await poll(async () => {
  const response = await fetch(`${prometheusUrl}/api/v1/targets`);
  if (!response.ok) return null;
  const body = await response.json();
  const active = body.data?.activeTargets ?? [];
  const required = ['agentops-api', 'agentops-worker'];
  return required.every((job) =>
    active.some(
      (target) =>
        target.labels?.job === job && target.health === 'up',
    ),
  )
    ? active
    : null;
});

const [grafanaHealth, datasource, dashboards] = await Promise.all([
  expectJson(`${grafanaUrl}/api/health`, authorization),
  expectJson(`${grafanaUrl}/api/datasources/name/Prometheus`, authorization),
  expectJson(`${grafanaUrl}/api/search?query=OpenSupport`, authorization),
]);
if (grafanaHealth.database !== 'ok') throw new Error('grafana_database_not_ok');
if (datasource.name !== 'Prometheus') throw new Error('grafana_datasource_missing');
if (
  !Array.isArray(dashboards) ||
  !dashboards.some((dashboard) => dashboard.title === 'OpenSupport AgentOps')
) {
  throw new Error('grafana_dashboard_missing');
}

process.stdout.write(`${JSON.stringify({
  status: 'passed',
  prometheus_jobs: [...new Set(targets.map((target) => target.labels?.job))]
    .filter(Boolean)
    .sort(),
  grafana_database: grafanaHealth.database,
  grafana_datasource: datasource.name,
  grafana_dashboard: 'OpenSupport AgentOps',
})}\n`);

async function expectJson(url, authorizationHeader) {
  const response = await fetch(url, {
    headers: { authorization: authorizationHeader },
  });
  if (!response.ok) throw new Error(`http_${response.status}:${url}`);
  return response.json();
}

async function poll(operation, attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const value = await operation();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error('observability_poll_timeout');
}

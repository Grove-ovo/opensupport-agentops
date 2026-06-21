import { createServer, type Server } from 'node:http';
import type { AsyncMonitorWorker } from './worker.js';
import type { WorkerMetrics } from './contracts.js';

export function createHealthServer(
  worker: AsyncMonitorWorker,
  metrics: WorkerMetrics,
  version: string,
): Server {
  return createServer(async (request, response) => {
    if (request.url === '/health/live') {
      return json(response, 200, {
        status: 'ok',
        service: 'worker',
        version,
      });
    }
    if (request.url === '/health/ready') {
      const checks = await worker.ready();
      const ready =
        checks.postgres &&
        checks.redis &&
        checks.consumer_group &&
        checks.migration >= checks.required_migration;
      return json(response, ready ? 200 : 503, {
        status: ready ? 'ready' : 'not_ready',
        checks,
      });
    }
    if (request.url === '/metrics') {
      response.writeHead(200, {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      });
      response.end(metrics.render());
      return;
    }
    return json(response, 404, {
      error: { code: 'not_found', message: 'Route not found' },
    });
  });
}

function json(
  response: import('node:http').ServerResponse,
  status: number,
  body: unknown,
) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

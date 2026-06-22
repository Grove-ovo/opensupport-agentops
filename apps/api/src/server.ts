import { loadApiConfig } from './config.js';
import { createRuntimeApp } from './runtime.js';

const config = loadApiConfig();
const app = await createRuntimeApp(config);
let closing = false;

async function shutdown(signal: string): Promise<void> {
  if (closing) {
    return;
  }
  closing = true;
  app.log.info({ signal }, 'shutdown requested');
  const forced = setTimeout(() => {
    app.log.error({ signal }, 'shutdown deadline exceeded');
    process.exitCode = 1;
  }, config.shutdownTimeoutMs);
  forced.unref();
  await app.close();
  clearTimeout(forced);
}

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});
process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error({ err: error }, 'API startup failed');
  await app.close();
  process.exitCode = 1;
}

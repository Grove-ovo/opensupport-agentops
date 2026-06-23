import { createProductionMockServer } from './production-mock.mjs';

const port = Number(process.env.SMOKE_MOCK_PORT ?? 18090);
const server = createProductionMockServer();
await new Promise((resolve) => server.listen(port, '0.0.0.0', resolve));
process.stdout.write(`${JSON.stringify({ status: 'ready', port })}\n`);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.closeAllConnections();
    server.close(() => process.exit(0));
  });
}

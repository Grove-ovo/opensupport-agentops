import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';

const { Client } = pg;
const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://agentops:agentops@localhost:5432/agentops';
const directory = resolve('infra/migrations');
const files = (await readdir(directory))
  .filter((file) => /^\d{4}_.+\.sql$/u.test(file))
  .sort();
const client = new Client({
  connectionString: databaseUrl,
  application_name: 'opensupport-agentops-migrator',
});

await client.connect();
try {
  await client.query('SELECT pg_advisory_lock($1)', [2_606_202_026]);
  for (const file of files) {
    process.stdout.write(`Applying ${file}... `);
    await client.query(await readFile(resolve(directory, file), 'utf8'));
    process.stdout.write('done\n');
  }
} finally {
  await client.query('SELECT pg_advisory_unlock($1)', [2_606_202_026]).catch(() => {});
  await client.end();
}

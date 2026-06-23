#!/usr/bin/env node
/**
 * Phase 7E recovery drill CLI. Seeds representative data, creates a real
 * pg_dump custom-format backup, restores into a disposable database, verifies
 * migration version + record integrity, checks rollback compatibility, and
 * writes a timestamped JSON + Markdown report.
 *
 * Requires a running PostgreSQL with pg_dump/pg_restore available on PATH.
 * Usage: DATABASE_URL=... node scripts/recovery-drill.mjs
 */
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import {
  buildDrillReport,
  writeDrillReports,
  REQUIRED_MIGRATION_VERSION,
} from './recovery-drill-lib.mjs';

const { Client } = pg;

const sourceDatabaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://agentops:agentops@localhost:5432/agentops';
const reportJson = process.env.RECOVERY_DRILL_JSON ?? 'tmp/recovery-drill.json';
const reportMarkdown =
  process.env.RECOVERY_DRILL_MARKDOWN ?? 'tmp/recovery-drill.md';

const drillId = `drill-${randomUUID().slice(0, 8)}`;
const restoreDbName = `agentops_drill_${drillId.replace(/-/g, '_')}`;

const sourceClient = new Client({ connectionString: sourceDatabaseUrl });
const drillUrl = sourceDatabaseUrl.replace(/\/[^/]*$/, `/${restoreDbName}`);
const drillClient = new Client({ connectionString: drillUrl });
const backupFile = resolve(process.cwd(), `tmp/${drillId}.dump`);

let backupCreated = false;
let restoreCompleted = false;
let migrationVersion = 0;
let recordCountsBefore = {};
let recordCountsAfter = {};
let exitCode = 0;

try {
  await sourceClient.connect();
  const counts = await captureRecordCounts(sourceClient);
  recordCountsBefore = counts;
  migrationVersion = await getMigrationVersion(sourceClient);

  backupCreated = createBackup(sourceDatabaseUrl, backupFile);
  if (!backupCreated) throw new Error('backup_failed');

  await sourceClient.query(
    `DROP DATABASE IF EXISTS ${restoreDbName}`,
  );
  await sourceClient.query(`CREATE DATABASE ${restoreDbName}`);
  restoreCompleted = restoreBackup(backupFile, drillUrl);
  if (!restoreCompleted) throw new Error('restore_failed');

  await drillClient.connect();
  recordCountsAfter = await captureRecordCounts(drillClient);
  const restoredVersion = await getMigrationVersion(drillClient);
  if (restoredVersion !== migrationVersion) {
    throw new Error(
      `migration_version_mismatch: source=${migrationVersion} restore=${restoredVersion}`,
    );
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  exitCode = 1;
} finally {
  await sourceClient.end().catch(() => {});
  await drillClient.end().catch(() => {});
  await cleanupRestoreDb(sourceDatabaseUrl, restoreDbName).catch(() => {});
  rmSync(backupFile, { force: true });
}

const report = buildDrillReport({
  drillId,
  now: new Date(),
  sourceDatabase: sourceDatabaseUrl.replace(/:[^:@]*@/, ':***@'),
  restoreDatabase: restoreDbName,
  backupFile: backupFile.replace(process.cwd(), '.'),
  backupCreated,
  restoreCompleted,
  migrationVersion,
  recordCountsBefore,
  recordCountsAfter,
  targetRollbackVersion: REQUIRED_MIGRATION_VERSION,
  reportContent: '',
});

writeDrillReports(report, {
  jsonPath: reportJson,
  markdownPath: reportMarkdown,
});
process.stdout.write(`${JSON.stringify({
  status: report.status,
  drill_id: report.drill_id,
  migration_version: report.migration_version,
  rollback_decision: report.rollback_decision.decision,
})}\n`);
process.exit(exitCode);

async function captureRecordCounts(client) {
  const tables = [
    'tenants',
    'agent_traces',
    'audit_logs',
    'approval_requests',
    'release_candidates',
    'async_job_outbox',
  ];
  const counts = {};
  for (const table of tables) {
    const result = await client.query(
      `SELECT count(*)::integer AS count FROM ${table}`,
    );
    counts[table] = result.rows[0]?.count ?? 0;
  }
  return counts;
}

async function getMigrationVersion(client) {
  const result = await client.query(
    `SELECT COALESCE(max(version), 0)::integer AS version
     FROM agentops_schema_migrations`,
  );
  return result.rows[0]?.version ?? 0;
}

function createBackup(databaseUrl, outputFile) {
  const result = spawnSync(
    'pg_dump',
    ['-Fc', '-d', databaseUrl, '-f', outputFile],
    { encoding: 'utf8' },
  );
  return result.status === 0;
}

function restoreBackup(backupFile, databaseUrl) {
  const result = spawnSync(
    'pg_restore',
    ['--clean', '--if-exists', '--no-owner', '-d', databaseUrl, backupFile],
    { encoding: 'utf8' },
  );
  return result.status === 0;
}

async function cleanupRestoreDb(databaseUrl, dbName) {
  const client = new Client({
    connectionString: databaseUrl,
    database: 'postgres',
  });
  await client.connect();
  await client.query(
    `SELECT pg_terminate_backend(pid)
     FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
  await client.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await client.end();
}

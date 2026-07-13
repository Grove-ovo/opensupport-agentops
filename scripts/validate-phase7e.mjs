import { existsSync, readFileSync } from 'node:fs';

const requiredPaths = [
  'scripts/recovery-drill.mjs',
  'scripts/recovery-drill-lib.mjs',
  'scripts/recovery-drill.test.mjs',
  'scripts/ops/backup.sh',
  'scripts/ops/restore.sh',
  '.trellis/spec/infra/phase-7e-recovery-drill.md',
];
const failures = [];

for (const path of requiredPaths) {
  if (!existsSync(path)) {
    failures.push(`missing Phase 7E artifact: ${path}`);
  }
}

const lib = read('scripts/recovery-drill-lib.mjs');
const cli = read('scripts/recovery-drill.mjs');
const backupScript = read('scripts/ops/backup.sh');
const restoreScript = read('scripts/ops/restore.sh');
const packageJson = read('package.json');
const spec = read('.trellis/spec/infra/phase-7e-recovery-drill.md');

for (const value of [
  'buildDrillReport',
  'checkRollbackCompatibility',
  'scanForSecrets',
  'writeDrillReports',
  'REQUIRED_MIGRATION_VERSION',
  'pg_dump',
  'pg_restore',
  'forward_only_schema_no_rollback_path',
  'migration_version',
  'rollback_decision',
  'secret_absence',
  'record_integrity',
]) {
  if (!lib.includes(value) && !cli.includes(value)) {
    failures.push(`recovery drill missing contract: ${value}`);
  }
}

for (const value of [
  'umask 077',
  'pg_dump -Fc',
  'Backup written to volume path',
]) {
  if (!backupScript.includes(value)) {
    failures.push(`backup script missing contract: ${value}`);
  }
}

for (const value of [
  'pg_restore',
  '--clean',
  '--if-exists',
  '--no-owner',
]) {
  if (!restoreScript.includes(value)) {
    failures.push(`restore script missing contract: ${value}`);
  }
}

if (!packageJson.includes('"test:phase7e"')) {
  failures.push('package.json missing test:phase7e script');
}

if (!packageJson.includes('"recovery:drill"')) {
  failures.push('package.json missing recovery:drill script');
}

for (const value of [
  'rollback compatibility',
  'forward-only',
  'machine-readable',
  'corrupted',
  'secret-safe',
]) {
  if (!spec.toLowerCase().includes(value.toLowerCase())) {
    failures.push(`recovery drill spec missing concept: ${value}`);
  }
}

if (failures.length > 0) {
  console.error('Phase 7E validation failed:');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log('Phase 7E recovery drill passed.');

function read(path) {
  return readFileSync(path, 'utf8');
}

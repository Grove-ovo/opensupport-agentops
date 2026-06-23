# Phase 7E Recovery Drill

## Scenario: Disposable Backup/Restore Rollback Verification

### 1. Scope / Trigger

- Trigger: changes to backup/restore scripts, the recovery drill, or the
  forward-only migration rollback contract.
- Applies to `scripts/recovery-drill.mjs`, `scripts/recovery-drill-lib.mjs`,
  `scripts/ops/backup.sh`, `scripts/ops/restore.sh`, and
  `scripts/validate-phase7e.mjs`.

### 2. Signatures

```text
DATABASE_URL=... npm run recovery:drill
npm run test:phase7e
```

```ts
buildDrillReport(input): RecoveryDrillReport
checkRollbackCompatibility(currentVersion, targetVersion): RollbackDecision
scanForSecrets(text): SecretFinding[]
writeDrillReports(report, options): { jsonPath, markdownPath }
```

### 3. Contracts

- **Backup is real custom-format.** The drill creates a `pg_dump -Fc` backup
  of the source database — not a logical SQL dump. The backup is a real file
  that can be restored via `pg_restore`.
- **Restore is disposable.** The drill creates a temporary database
  (`agentops_drill_<id>`), restores the backup into it with `--clean --if-exists
  --no-owner`, verifies record integrity, then drops the temporary database and
  deletes the backup file.
- **Record integrity is hash-verified.** Representative record counts
  (tenants, traces, audit_logs, approval_requests, release_candidates,
  async_job_outbox) must match before and after restore. Mismatches block the
  drill.
- **Migration version is confirmed.** Both the source and restored databases
  must report migration version 16 (the current required floor). A mismatch
  blocks the drill.
- **Rollback compatibility is machine-readable.** The forward-only schema has
  no rollback path — downgrading to a lower migration version is `incompatible`
  with reason `forward_only_schema_no_rollback_path`. Same-version rollback is
  `compatible`. Target-higher-than-current is `incompatible`.
- **Reports are secret-safe.** The drill report never contains database URLs
  with passwords, secret values, or credential patterns. The source database
  URL is redacted (`:***@`) in the report.
- **Corrupted/missing backups fail safely.** If `pg_dump` or `pg_restore`
  fails, the drill reports `blocked` with a clear reason code and cleans up the
  temporary database.

### 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| pg_dump fails | `backup_created` blocked with `backup_failed` |
| pg_restore fails | `restore_completed` blocked with `restore_failed` |
| Migration version != 16 | `migration_version` blocked with `migration_version_mismatch` |
| Record counts mismatch | `record_integrity` blocked with `records_mismatch` |
| Secret detected in report | `secret_absence` blocked with `secrets_detected_in_report` |
| Rollback target < current | `rollback_compatibility` blocked with `rollback_incompatible` |
| No representative records | `record_integrity` warning with `no_representative_records` |
| Temporary DB exists | dropped before create (`DROP DATABASE IF EXISTS`) |

### 5. Good / Base / Bad Cases

- Good: seed representative data, create a real custom-format backup, restore
  into a disposable database, verify all record counts match, confirm
  migration version 16, report `ready` with a compatible same-version rollback
  decision.
- Base: a database with zero representative records — the drill reports a
  warning but still passes if backup/restore succeed.
- Bad: attempt to rollback to a lower migration version — the decision is
  `incompatible` and the drill blocks with `forward_only_schema_no_rollback_path`.
- Bad: leave the backup file or temporary database on disk after a failed
  drill.

### 6. Tests Required

- Unit tests (`scripts/recovery-drill.test.mjs`): ready case, backup-failed
  blocked, migration-mismatch blocked, record-mismatch blocked, rollback
  compatibility (compatible/incompatible/downgrade/higher), secret scanner
  (detect + redact + clean pass), markdown rendering, report file writing with
  mode 0600.
- Artifact validation (`scripts/validate-phase7e.mjs`): script existence,
  contract strings, package.json scripts, spec concepts.

### 7. Wrong vs Correct

### Wrong

```sh
pg_dump -Fp agentops > backup.sql  # plain-text dump, not restorable via pg_restore
```

### Correct

```sh
pg_dump -Fc agentops -f backup.dump   # custom format, restorable via pg_restore
pg_restore --clean --if-exists --no-owner -d agentops_drill backup.dump
```

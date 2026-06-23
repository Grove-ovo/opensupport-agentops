# Phase 7E: Backup Restore Rollback Drill

## Goal

Prove that backups are restorable and that an application rollback procedure is
compatible with the forward-only database schema.

## Requirements

- Seed representative tenant, trace, audit, approval, release, and worker data.
- Create a real custom-format PostgreSQL backup.
- Restore into a disposable database/container.
- Verify migration version 16 and hashes/counts of representative records.
- Verify secrets are not present in backup reports.
- Add rollback compatibility checks and explicit incompatible-version failure.
- Produce a timestamped recovery drill report.

## Acceptance Criteria

- [x] Backup and disposable restore complete automatically.
- [x] Representative immutable records match before and after restore.
- [x] Corrupted/missing backups fail safely.
- [x] Rollback compatibility decision is machine-readable and documented.

## Out Of Scope

- Restoring a real production database.

# Phase 7C Production Preflight

## 1. Scope / Trigger

Use this contract when changing production environment files, secret-file
requirements, image/build identity, ports, provider origins, monitoring,
backup paths, or commands that start the production Compose stack.

## 2. Signatures

```text
AGENTOPS_ENV_FILE=.env.production npm run deploy:preflight
AGENTOPS_ENV_FILE=.env.production npm run deploy:up
node scripts/deploy-preflight.mjs \
  --env-file <path> --json <path> --markdown <path>
```

```ts
runDeployPreflight(options): DeployReadinessReport
writeDeployReadinessReports(report, paths)
```

## 3. Contracts

- Host preflight runs before Compose because only the host can verify the
  environment file, secret paths, permissions, and backup directory.
- `deploy:up` is the approved startup command and chains preflight before
  `docker compose up`.
- Overall status is `blocked` if any blocker exists, otherwise `warning` if
  any warning exists, otherwise `ready`. Only `ready` exits zero.
- Reports contain stable IDs/reason codes, key names, file mode/size,
  non-secret metadata, and truncated SHA-256 fingerprints.
- Reports never contain environment values, passwords, tokens, provider
  credentials, or secret-file contents.
- `.env.production` must be a regular non-symlink `0600` file. Secret files
  must be regular non-symlink files with no group/other permission.
- `/backups` binds the exact absolute host path validated by
  `AGENTOPS_BACKUP_DIR`.
- The committed production example is intentionally blocked until every
  placeholder is replaced.

## 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| Required key missing | `blocked required_value_missing` |
| Weak/placeholder credential | `blocked credential_weak_or_placeholder` |
| Secret absent, unsafe mode, or invalid shape | `blocked secret_file_*` |
| OIDC/public origin mismatch | `blocked oidc_callback_origin_mismatch` |
| HTTP/private provider origin | `blocked provider_origin_unsafe` |
| Mutable/local/smoke build tag | `blocked build_version_mutable_or_placeholder` |
| Port collision/out of range | `blocked ports_invalid_or_conflicting` |
| Smoke credential present | `blocked smoke_credentials_present` |
| Backup retention omitted | `warning backup_retention_not_configured` |
| Every required check passes | overall `ready`, exit zero |

## 5. Good / Base / Bad Cases

- Good: generate unique ephemeral secrets, mode files `0600`, create the
  backup directory, run preflight, review both reports, then run `deploy:up`.
- Base: backup retention is undecided; report is `warning` and startup remains
  blocked until explicitly accepted/configured.
- Bad: run `docker compose up` directly with `.env.production.example`.
- Bad: print failing secret values to explain a validation error.
- Bad: validate a host path that Compose does not actually mount.

## 6. Tests Required

- Ephemeral valid config produces `ready` JSON and Markdown.
- Unsafe fixture covers placeholders, smoke values, bad file modes, unsafe
  provider origin, mutable build tag, and incomplete HTTPS.
- Warning fixture proves non-blocking status classification.
- Scan report content to prove fixture secrets are absent.
- CLI exit code is zero only for ready.
- Production example must fail closed.
- Compose config, full tests, type-check, lint, and task validation pass.

## 7. Wrong vs Correct

### Wrong

```sh
docker compose --env-file .env.production \
  -f infra/docker/compose.production.yml up -d
```

### Correct

```sh
AGENTOPS_ENV_FILE=.env.production npm run deploy:up
```

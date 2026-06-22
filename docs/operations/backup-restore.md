# Backup And Restore

## Backup

Preview:

```sh
npm run ops:backup:dry-run
```

Execute:

```sh
ENV_FILE=.env.production sh scripts/ops/backup.sh
```

The command creates a PostgreSQL custom-format dump in the Compose `backups`
volume. Copy dumps to encrypted off-host storage and apply retention controls.
Redis AOF, Prometheus, and Grafana volumes are operational caches/configuration;
PostgreSQL is the authoritative business record.

## Restore Drill

Preview the destructive command:

```sh
npm run ops:restore:dry-run
```

Restore a selected dump:

```sh
ENV_FILE=.env.production \
  sh scripts/ops/restore.sh agentops-YYYYMMDDTHHMMSSZ.dump --confirm
```

The script stops API and worker, runs `pg_restore --clean --if-exists`, then
starts API, worker, and web. After restore:

```sh
curl -fsS http://127.0.0.1:8088/health/ready
npm run smoke:production
```

Perform a restore drill before every major release and at least quarterly.

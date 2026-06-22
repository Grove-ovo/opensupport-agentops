#!/bin/sh
set -eu

compose_file="${COMPOSE_FILE:-infra/docker/compose.production.yml}"
env_file="${ENV_FILE:-.env.production}"
backup="${1:-}"
confirmation="${2:-}"

if [ -z "$backup" ]; then
  printf 'Usage: %s <backup.dump> [--confirm]\n' "$0" >&2
  exit 2
fi

command="docker compose --env-file ${env_file} -f ${compose_file} exec -T postgres pg_restore --clean --if-exists --no-owner -U \${POSTGRES_USER} -d \${POSTGRES_DB} /backups/${backup}"

if [ "$confirmation" != "--confirm" ]; then
  printf 'DRY RUN: %s\n' "$command"
  printf 'Re-run with --confirm to execute destructive restore.\n'
  exit 0
fi

docker compose --env-file "$env_file" -f "$compose_file" stop api worker
docker compose --env-file "$env_file" -f "$compose_file" exec -T postgres \
  sh -ec "pg_restore --clean --if-exists --no-owner -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" \"/backups/${backup}\""
docker compose --env-file "$env_file" -f "$compose_file" up -d api worker web
printf 'Restore completed from /backups/%s\n' "$backup"

#!/bin/sh
set -eu

compose_file="${COMPOSE_FILE:-infra/docker/compose.production.yml}"
env_file="${ENV_FILE:-.env.production}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
output="${BACKUP_NAME:-agentops-${timestamp}.dump}"

command="docker compose --env-file ${env_file} -f ${compose_file} exec -T postgres pg_dump -Fc -U \${POSTGRES_USER} -d \${POSTGRES_DB} -f /backups/${output}"

if [ "${1:-}" = "--dry-run" ]; then
  printf '%s\n' "$command"
  exit 0
fi

docker compose --env-file "$env_file" -f "$compose_file" exec -T postgres \
  sh -ec "pg_dump -Fc -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -f \"/backups/${output}\""
printf 'Backup written to volume path /backups/%s\n' "$output"

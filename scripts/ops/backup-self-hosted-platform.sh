#!/bin/sh
set -eu

compose_file="${PLATFORM_COMPOSE_FILE:-infra/docker/compose.self-hosted-platform.yml}"
env_file="${PLATFORM_ENV_FILE:-.env.platform}"
backup_dir="${PLATFORM_BACKUP_DIR:-/var/backups/opensupport-platform}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
keycloak_backup="$backup_dir/keycloak-${timestamp}.dump"
chatwoot_backup="$backup_dir/chatwoot-${timestamp}.dump"
storage_backup="$backup_dir/chatwoot-storage-${timestamp}.tar.gz"
chatwoot_stopped=0

case "$backup_dir" in
  /*) ;;
  *)
    printf 'PLATFORM_BACKUP_DIR must be an absolute path.\n' >&2
    exit 2
    ;;
esac

compose() {
  docker compose --env-file "$env_file" -f "$compose_file" "$@"
}

restart_chatwoot() {
  if [ "$chatwoot_stopped" -eq 1 ]; then
    compose up -d chatwoot-web chatwoot-sidekiq >/dev/null 2>&1 || true
  fi
}

if [ "${1:-}" = "--dry-run" ]; then
  printf 'Would create mode-0600 backups in %s:\n' "$backup_dir"
  printf '  %s\n  %s\n  %s\n' "$keycloak_backup" "$chatwoot_backup" "$storage_backup"
  printf 'Chatwoot web and Sidekiq would be stopped while its database and storage are captured.\n'
  exit 0
fi

umask 077
mkdir -p "$backup_dir"

for output in "$keycloak_backup" "$chatwoot_backup" "$storage_backup"; do
  if [ -e "$output" ] || [ -L "$output" ]; then
    printf 'Refusing to overwrite existing backup %s\n' "$output" >&2
    exit 1
  fi
done

trap restart_chatwoot EXIT
trap 'exit 1' HUP INT TERM

compose exec -T keycloak-postgres pg_dump -Fc -U keycloak -d keycloak >"$keycloak_backup"

compose stop chatwoot-web chatwoot-sidekiq
chatwoot_stopped=1
compose exec -T chatwoot-postgres pg_dump -Fc -U chatwoot -d chatwoot >"$chatwoot_backup"
compose run --rm --no-deps -T --entrypoint tar chatwoot-web \
  -C /app/storage -czf - . >"$storage_backup"

compose up -d chatwoot-web chatwoot-sidekiq
chatwoot_stopped=0
trap - EXIT HUP INT TERM

printf 'Platform backups written to %s\n' "$backup_dir"

#!/bin/sh
set -eu

env_file="${ENV_FILE:-.env.production}"
compose_file="${COMPOSE_FILE:-infra/docker/compose.production.yml}"
primary_compose_file="${compose_file%%:*}"

if [ ! -f "$primary_compose_file" ]; then
  printf 'Compose file not found: %s\n' "$primary_compose_file" >&2
  exit 2
fi

compose_dir="$(cd "$(dirname "$primary_compose_file")" && pwd -P)"

lookup_env() {
  key="$1"
  eval "value=\${$key:-}"
  if [ -n "$value" ]; then
    printf '%s' "$value"
    return 0
  fi
  if [ -f "$env_file" ]; then
    value="$(grep -E "^${key}=" "$env_file" | tail -n 1 | sed "s/^${key}=//; s/^['\\\"]//; s/['\\\"]$//" || true)"
    printf '%s' "$value"
  fi
}

resolve_path() {
  value="$1"
  case "$value" in
    /*) printf '%s' "$value" ;;
    *) printf '%s/%s' "$compose_dir" "$value" ;;
  esac
}

privileged() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    printf 'Need root or sudo to update secret ownership.\n' >&2
    exit 1
  fi
}

prepare_secret() {
  label="$1"
  key="$2"
  default_path="$3"
  owner="$4"
  path_value="$(lookup_env "$key")"
  if [ -z "$path_value" ]; then
    path_value="$default_path"
  fi
  path="$(resolve_path "$path_value")"
  if [ ! -f "$path" ]; then
    printf 'Secret file missing for %s: %s\n' "$label" "$path" >&2
    exit 1
  fi
  privileged chmod 0400 "$path"
  privileged chown "$owner" "$path"
  printf 'prepared %s secret ownership at %s\n' "$label" "$path"
}

prepare_secret master_key AGENTOPS_MASTER_KEY_FILE ../../secrets/agentops_master_key 999:999
prepare_secret oidc_client_secret AGENTOPS_OIDC_CLIENT_SECRET_FILE ../../secrets/agentops_oidc_client_secret 999:999
prepare_secret operator_session_key AGENTOPS_OPERATOR_SESSION_KEY_FILE ../../secrets/agentops_operator_session_key 999:999
prepare_secret grafana_admin_password GRAFANA_ADMIN_PASSWORD_FILE ../../secrets/grafana_admin_password 472:472

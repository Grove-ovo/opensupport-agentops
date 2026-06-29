#!/usr/bin/env bash
set -euo pipefail

compose() {
  docker compose --env-file .env.ci.smoke \
    -f infra/docker/compose.production.yml \
    -f infra/docker/compose.ci-smoke.yml \
    "$@"
}

dump_core() {
  compose ps --all || true
  compose logs --no-color --tail=200 \
    postgres redis migrate api worker web smoke-mock || true
}

container_id_for() {
  local service="$1"
  local container_id
  container_id="$(compose ps --all -q "$service" 2>/dev/null || true)"
  if [ -z "$container_id" ]; then
    local project_name="${COMPOSE_PROJECT_NAME:-opensupport-agentops}"
    container_id="$(
      docker ps -a \
        --filter "name=^/${project_name}-${service}-1$" \
        --format '{{.ID}}' \
        | head -n 1
    )"
  fi
  printf '%s' "$container_id"
}

annotate_failure() {
  local message="$1"
  echo "::error title=Core boot failure::$message"
}

wait_healthy() {
  local service="$1"
  local attempts="$2"
  for attempt in $(seq 1 "$attempts"); do
    local container_id
    container_id="$(container_id_for "$service")"
    if [ -n "$container_id" ]; then
      local state
      local health
      state="$(docker inspect --format '{{.State.Status}}' "$container_id" 2>/dev/null || true)"
      health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)"
      if [ "$health" = "healthy" ]; then
        echo "$service is healthy"
        return 0
      fi
      if [ "$state" = "exited" ] || [ "$state" = "dead" ]; then
        annotate_failure "$service exited while waiting for health"
        dump_core
        return 1
      fi
    fi
    sleep 2
  done
  annotate_failure "$service did not become healthy"
  dump_core
  return 1
}

wait_completed() {
  local service="$1"
  local attempts="$2"
  for attempt in $(seq 1 "$attempts"); do
    local container_id
    container_id="$(container_id_for "$service")"
    if [ -n "$container_id" ]; then
      local state
      local exit_code
      state="$(docker inspect --format '{{.State.Status}}' "$container_id" 2>/dev/null || true)"
      exit_code="$(docker inspect --format '{{.State.ExitCode}}' "$container_id" 2>/dev/null || true)"
      if [ "$state" = "exited" ] && [ "$exit_code" = "0" ]; then
        echo "$service completed successfully"
        return 0
      fi
      if [ "$state" = "exited" ] && [ "$exit_code" != "0" ]; then
        annotate_failure "$service exited with code $exit_code"
        dump_core
        return 1
      fi
    fi
    sleep 2
  done
  annotate_failure "$service did not complete"
  dump_core
  return 1
}

compose up -d --build postgres redis
wait_healthy postgres 90
wait_healthy redis 90

compose up -d --build --no-deps migrate
wait_completed migrate 90

compose up -d --build --no-deps api worker
wait_healthy api 150
wait_healthy worker 150

compose up -d --build --no-deps web
wait_healthy web 90

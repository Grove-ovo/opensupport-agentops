# Incident Response

## Triage

```sh
docker compose --env-file .env.production \
  -f infra/docker/compose.production.yml ps

docker compose --env-file .env.production \
  -f infra/docker/compose.production.yml logs --since 30m api worker web

curl -fsS http://127.0.0.1:9090/api/v1/targets
```

Correlate structured logs with:

- `request_id`
- `canonical_event_id`
- `trace_id`
- `provider_call_id`
- `delivery_id`
- `execution_id`
- `outbox_id`
- `stream_id`

## Containment

- Provider or Chatwoot failure: move affected tenant runtime mode to Shadow.
- Unsafe output or P0 gate: stop Auto promotion and archive the release
  candidate.
- Worker poison job: inspect the dead-letter error code and immutable
  aggregate reference; never replay raw payloads.
- Credential exposure: rotate the credential and follow the rotation runbook.
- Database integrity concern: stop API and worker before restoring.

## Evidence

Preserve service logs, Prometheus queries, alert history, safe audit records,
and build metadata. Do not copy customer plaintext, prompts, or secret files
into incident channels.

# Production Deployment Runbook

## Prerequisites

- Docker Engine with Compose v2.
- A host with persistent storage and inbound access to the configured public
  port.
- Real Chatwoot and LLM provider credentials.
- TLS termination in front of the public Compose port for internet exposure.

## Prepare Configuration

```sh
cp .env.production.example .env.production
mkdir -p secrets
node -e "console.log('base64url:' + require('crypto').randomBytes(32).toString('base64url'))" \
  > secrets/agentops_master_key
openssl rand -out secrets/agentops_operator_session_key 32
openssl rand -base64 -out secrets/agentops_oidc_client_secret 48
openssl rand -base64 -out secrets/grafana_admin_password 32
chmod 600 .env.production secrets/*
```

Replace every placeholder password and configure provider origins, prices,
Chatwoot secrets, OIDC issuer/client/callback values, and build version. Never
commit `.env.production` or `secrets/`.

See [Operator Authentication](../operator_authentication.md) for identity
claims, cookie requirements, and session-key rotation.
See [Edge And Transport Security](../edge_transport_security.md) for public
scheme, HSTS, request limits, and trusted proxy behavior.

## Validate And Build

```sh
docker compose --env-file .env.production \
  -f infra/docker/compose.production.yml config

docker compose --env-file .env.production \
  -f infra/docker/compose.production.yml build
```

## Rollout

```sh
npm run ops:backup:dry-run
sh scripts/ops/backup.sh

docker compose --env-file .env.production \
  -f infra/docker/compose.production.yml up -d

docker compose --env-file .env.production \
  -f infra/docker/compose.production.yml ps

curl -fsS http://127.0.0.1:8088/health/ready
curl -fsS http://127.0.0.1:8088/worker/health/ready
```

The one-shot `migrate` service must exit successfully before API and worker
start. Do not bypass migration health ordering.

## Smoke

For the local production smoke, set the provider origin before starting the
stack:

```sh
AGENTOPS_PROVIDER_BASE_URLS_JSON='{"openai":"http://host.docker.internal:18090"}'
AGENTOPS_MODEL_PRICING_JSON='{"smoke-model":{"inputCostPerMillion":0.5,"outputCostPerMillion":1.5}}'
export AGENTOPS_PROVIDER_BASE_URLS_JSON AGENTOPS_MODEL_PRICING_JSON

npm run smoke:production
```

The smoke creates an archived test tenant, sends a signed Chatwoot event,
verifies a public mock Chatwoot delivery, waits for worker aggregation, and
loads the dashboard through Nginx.

## Rollback

1. Stop new ingress at the upstream load balancer or TLS proxy.
2. Capture logs and run a backup.
3. Set `AGENTOPS_BUILD_VERSION` to the previous immutable image tag.
4. Run `docker compose ... up -d api worker web`.
5. Verify API/worker readiness and Dashboard.

Database migrations are forward-only. If the previous application cannot read
the migrated schema, stop API/worker and restore the pre-rollout backup using
the backup runbook. Never run ad hoc down-migrations.

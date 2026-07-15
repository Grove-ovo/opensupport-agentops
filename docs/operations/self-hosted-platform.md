# Self-Hosted Identity And Chatwoot

The single-host production topology uses Keycloak for AgentOps OIDC and a real
Chatwoot installation. Caddy terminates TLS on the host:

| Public origin | Loopback upstream |
|---|---|
| `https://agentops.grove.engineer` | `127.0.0.1:8088` |
| `https://auth.grove.engineer` | `127.0.0.1:8090` |
| `https://chatwoot.grove.engineer` | `127.0.0.1:4000` |

Databases and Redis have no published host ports. The platform stack uses
persistent Docker volumes, fixed default image versions, bounded container
resources, and rotated local logs.

## Prepare

Create the two DNS records before starting Caddy certificate issuance:

```text
auth.grove.engineer     A  159.223.183.148
chatwoot.grove.engineer A  159.223.183.148
```

Generate unique server-only credentials:

```sh
cd /opt/opensupport-agentops
sh scripts/ops/prepare-self-hosted-platform.sh
```

The script creates `.env.platform` with mode `0600` and synchronizes the
Keycloak client secret to the AgentOps OIDC client secret file. Never commit
either file.

The generator refuses to replace either file. If credentials must be rotated,
back up the current files and coordinate the Keycloak client update with the
AgentOps secret before removing them.

Chatwoot's webhook timeout defaults to 5 seconds, which is shorter than the
30-second AgentOps tenant provider timeout. The platform Compose file therefore
sets the Chatwoot container's `WEBHOOK_TIMEOUT` to 60 seconds so a valid
provider call can finish before Chatwoot abandons the webhook request. To
override it, add the deployment-facing variable to `.env.platform` and recreate
the Chatwoot web and Sidekiq services:

```dotenv
CHATWOOT_WEBHOOK_TIMEOUT=90
```

```sh
docker compose --env-file .env.platform \
  -f infra/docker/compose.self-hosted-platform.yml up -d \
  chatwoot-web chatwoot-sidekiq
```

Keep this value above the longest AgentOps provider timeout plus expected
network overhead. It is not a secret and does not require adding a shared
`env_file` to the Chatwoot services.

## Configure Caddy

Add these sites to `/etc/caddy/Caddyfile` after all DNS records resolve to the
server:

```caddyfile
agentops.grove.engineer {
  reverse_proxy 127.0.0.1:8088
}

auth.grove.engineer {
  reverse_proxy 127.0.0.1:8090
}

chatwoot.grove.engineer {
  reverse_proxy 127.0.0.1:4000
}
```

Validate before reloading so a malformed edit does not replace the working
configuration:

```sh
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

## Validate And Start

```sh
docker compose --env-file .env.platform \
  -f infra/docker/compose.self-hosted-platform.yml config --quiet

docker compose --env-file .env.platform \
  -f infra/docker/compose.self-hosted-platform.yml pull

docker compose --env-file .env.platform \
  -f infra/docker/compose.self-hosted-platform.yml up -d
```

Keycloak imports the `agentops` realm, confidential
`opensupport-agentops` client, custom claim mappers, and temporary
`admin@grove.engineer` administrator on first startup.

After Chatwoot migration succeeds, create the initial super-admin using a
one-shot Rails runner. Read credentials from `.env.platform` inside the shell;
do not put the password on the command line or in shell history.

## AgentOps OIDC Values

```text
AGENTOPS_OIDC_ISSUER=https://auth.grove.engineer/realms/agentops
AGENTOPS_OIDC_CLIENT_ID=opensupport-agentops
AGENTOPS_OIDC_CALLBACK_URI=https://agentops.grove.engineer/api/v1/auth/callback
```

On a single host where Caddy terminates TLS, include the loopback override on
every AgentOps Compose operation so port 8088 cannot bypass the public proxy:

```sh
AGENTOPS_ENV_FILE=.env.production npm run deploy:preflight

docker compose --env-file .env.production \
  -f infra/docker/compose.production.yml \
  -f infra/docker/compose.caddy-loopback.yml up -d
```

Verify both local upstreams and public TLS after startup:

```sh
curl -fsS http://127.0.0.1:8088/health/ready
curl -fsS https://auth.grove.engineer/realms/agentops/.well-known/openid-configuration
curl -fsSI https://chatwoot.grove.engineer/
curl -fsS https://agentops.grove.engineer/health/ready
```

## Backup

The platform backup captures custom-format Keycloak and Chatwoot PostgreSQL
dumps plus Chatwoot local storage. It stops Chatwoot web and Sidekiq while the
Chatwoot database and storage are captured, then restarts them even if a backup
step fails. New files are created with mode `0600`.

```sh
PLATFORM_BACKUP_DIR=/var/backups/opensupport-platform \
  sh scripts/ops/backup-self-hosted-platform.sh --dry-run

PLATFORM_BACKUP_DIR=/var/backups/opensupport-platform \
  sh scripts/ops/backup-self-hosted-platform.sh

ENV_FILE=.env.production sh scripts/ops/backup.sh --dry-run
ENV_FILE=.env.production sh scripts/ops/backup.sh
```

Copy `/var/backups/opensupport-platform` and the configured AgentOps backup
directory to encrypted off-host storage. A backup left only on this VPS does
not cover host or disk failure.

## Rollback

1. Keep Caddy running and return a maintenance response for affected origins.
2. Run both backup commands above and capture container logs.
3. Set the previously recorded fixed image reference and recreate only the
   affected application service:

```sh
CHATWOOT_IMAGE="$PLATFORM_PREVIOUS_CHATWOOT_IMAGE" \
  docker compose --env-file .env.platform \
  -f infra/docker/compose.self-hosted-platform.yml up -d chatwoot-web chatwoot-sidekiq

KEYCLOAK_IMAGE="$PLATFORM_PREVIOUS_KEYCLOAK_IMAGE" \
  docker compose --env-file .env.platform \
  -f infra/docker/compose.self-hosted-platform.yml up -d keycloak
```

4. Confirm readiness and public TLS before removing the maintenance response.
5. Restore a database only after confirming the older image cannot read the
   migrated schema. Treat restore as a separate destructive recovery action;
   do not run ad hoc down-migrations.

#!/bin/sh
set -eu

ENV_FILE=${PLATFORM_ENV_FILE:-.env.platform}
AGENTOPS_OIDC_SECRET_FILE=${AGENTOPS_OIDC_CLIENT_SECRET_FILE:-secrets/agentops_oidc_client_secret}

if [ -e "$ENV_FILE" ] || [ -L "$ENV_FILE" ]; then
  echo "Refusing to overwrite existing $ENV_FILE" >&2
  exit 1
fi

if [ -e "$AGENTOPS_OIDC_SECRET_FILE" ] || [ -L "$AGENTOPS_OIDC_SECRET_FILE" ]; then
  echo "Refusing to overwrite existing $AGENTOPS_OIDC_SECRET_FILE" >&2
  exit 1
fi

umask 077
mkdir -p "$(dirname "$AGENTOPS_OIDC_SECRET_FILE")"

random_base64() {
  openssl rand -base64 "$1" | tr -d '\n'
}

keycloak_postgres_password=$(random_base64 36)
keycloak_bootstrap_password=$(random_base64 30)
keycloak_client_secret=$(random_base64 48)
agentops_admin_password=$(random_base64 24)
chatwoot_postgres_password=$(random_base64 36)
chatwoot_redis_password=$(openssl rand -hex 32)
chatwoot_secret_key_base=$(openssl rand -hex 64)
chatwoot_admin_password=$(random_base64 24)

cat >"$ENV_FILE" <<EOF
KEYCLOAK_POSTGRES_PASSWORD=$keycloak_postgres_password
KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME=admin
KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD=$keycloak_bootstrap_password
KEYCLOAK_AGENTOPS_CLIENT_SECRET=$keycloak_client_secret
AGENTOPS_ADMIN_PASSWORD=$agentops_admin_password
CHATWOOT_POSTGRES_PASSWORD=$chatwoot_postgres_password
CHATWOOT_REDIS_PASSWORD=$chatwoot_redis_password
SECRET_KEY_BASE=$chatwoot_secret_key_base
CHATWOOT_ADMIN_EMAIL=admin@grove.engineer
CHATWOOT_ADMIN_PASSWORD=$chatwoot_admin_password
EOF

printf '%s\n' "$keycloak_client_secret" >"$AGENTOPS_OIDC_SECRET_FILE"
chmod 600 "$ENV_FILE" "$AGENTOPS_OIDC_SECRET_FILE"

unset keycloak_postgres_password keycloak_bootstrap_password
unset keycloak_client_secret agentops_admin_password
unset chatwoot_postgres_password chatwoot_redis_password
unset chatwoot_secret_key_base chatwoot_admin_password

echo "Created $ENV_FILE and synchronized the AgentOps OIDC client secret."

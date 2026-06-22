# Credential Rotation

## Provider API Keys

Use Dashboard Settings to create a new immutable tenant model-config version
with a replacement API key. Verify one Shadow execution, then disable the old
provider credential.

## Chatwoot Secrets And Tokens

1. Add the new value to the deployment environment.
2. Update the tenant Chatwoot connection to the new `env:NAME` reference.
3. Restart API containers.
4. Verify signed ingress and one outbound message.
5. Revoke the old value.

## PostgreSQL, Redis, And Grafana

Schedule a maintenance window. Update `.env.production` or the mounted secret
file, recreate affected services, then verify readiness and Prometheus targets.

## Envelope Master Key

Do not replace `agentops_master_key` directly. Existing encrypted tenant keys
are authenticated with the old master key. Run a dedicated re-encryption
procedure that creates new model-config versions under the new key ID, verify
all tenants, and only then remove the old master key.

# Deploy Readiness Report

Status: **ready**

Generated: 2026-07-15T10:08:15.431Z

Ready: 44 | Warning: 0 | Blocked: 0

| Check | Status | Reason | Evidence |
|---|---|---|---|
| env_file | ready | env_file_secure | path=.env.production, mode=0600, bytes=1994, sha256=2b59f55f2e149670, regular_file=true, symlink=false |
| required:AGENTOPS_POSTGRES_PASSWORD | ready | required_value_present | key=AGENTOPS_POSTGRES_PASSWORD |
| required:AGENTOPS_REDIS_PASSWORD | ready | required_value_present | key=AGENTOPS_REDIS_PASSWORD |
| required:AGENTOPS_BUILD_VERSION | ready | required_value_present | key=AGENTOPS_BUILD_VERSION |
| required:AGENTOPS_MASTER_KEY_FILE | ready | required_value_present | key=AGENTOPS_MASTER_KEY_FILE |
| required:AGENTOPS_OIDC_ISSUER | ready | required_value_present | key=AGENTOPS_OIDC_ISSUER |
| required:AGENTOPS_OIDC_CLIENT_ID | ready | required_value_present | key=AGENTOPS_OIDC_CLIENT_ID |
| required:AGENTOPS_OIDC_CLIENT_SECRET_FILE | ready | required_value_present | key=AGENTOPS_OIDC_CLIENT_SECRET_FILE |
| required:AGENTOPS_OIDC_CALLBACK_URI | ready | required_value_present | key=AGENTOPS_OIDC_CALLBACK_URI |
| required:AGENTOPS_OPERATOR_SESSION_KEY_FILE | ready | required_value_present | key=AGENTOPS_OPERATOR_SESSION_KEY_FILE |
| required:AGENTOPS_PUBLIC_URL | ready | required_value_present | key=AGENTOPS_PUBLIC_URL |
| required:AGENTOPS_PUBLIC_SCHEME | ready | required_value_present | key=AGENTOPS_PUBLIC_SCHEME |
| required:AGENTOPS_HSTS_VALUE | ready | required_value_present | key=AGENTOPS_HSTS_VALUE |
| required:GRAFANA_ADMIN_USER | ready | required_value_present | key=GRAFANA_ADMIN_USER |
| required:GRAFANA_ADMIN_PASSWORD_FILE | ready | required_value_present | key=GRAFANA_ADMIN_PASSWORD_FILE |
| required:AGENTOPS_PROVIDER_BASE_URLS_JSON | ready | required_value_present | key=AGENTOPS_PROVIDER_BASE_URLS_JSON |
| required:AGENTOPS_MODEL_PRICING_JSON | ready | required_value_present | key=AGENTOPS_MODEL_PRICING_JSON |
| required:CHATWOOT_WEBHOOK_SECRET | ready | required_value_present | key=CHATWOOT_WEBHOOK_SECRET |
| required:CHATWOOT_API_TOKEN | ready | required_value_present | key=CHATWOOT_API_TOKEN |
| required:AGENTOPS_BACKUP_DIR | ready | required_value_present | key=AGENTOPS_BACKUP_DIR |
| strength:AGENTOPS_POSTGRES_PASSWORD | ready | credential_strength_valid | key=AGENTOPS_POSTGRES_PASSWORD, length=64, fingerprint=238242e4fd38a83d |
| strength:AGENTOPS_REDIS_PASSWORD | ready | credential_strength_valid | key=AGENTOPS_REDIS_PASSWORD, length=64, fingerprint=74df1bd3a3eaa3be |
| strength:CHATWOOT_WEBHOOK_SECRET | ready | credential_strength_valid | key=CHATWOOT_WEBHOOK_SECRET, length=24, fingerprint=1aac397bbfb6c165 |
| strength:CHATWOOT_API_TOKEN | ready | credential_strength_valid | key=CHATWOOT_API_TOKEN, length=24, fingerprint=22f7beefd354ab7b |
| credential_uniqueness | ready | credentials_unique | count=4 |
| secret:master_key | ready | secret_file_valid | path=secrets/agentops_master_key, mode=0400, bytes=54, sha256=272089b4568fb8d7, regular_file=true, symlink=false |
| secret:oidc_client_secret | ready | secret_file_valid | path=secrets/agentops_oidc_client_secret, mode=0400, bytes=65, sha256=73d0e8fed9d312d2, regular_file=true, symlink=false |
| secret:operator_session_key | ready | secret_file_valid | path=secrets/agentops_operator_session_key, mode=0400, bytes=32, sha256=75abe981696e2800, regular_file=true, symlink=false |
| secret:grafana_admin_password | ready | secret_file_valid | path=secrets/grafana_admin_password, mode=0400, bytes=45, sha256=fecb8068b1a69cd5, regular_file=true, symlink=false |
| secret_uniqueness | ready | secret_files_unique | count=4 |
| public_url | ready | public_url_valid | origin_hash=0e56bcc5c44de7a5 |
| oidc_issuer | ready | oidc_issuer_valid | origin_hash=d90a91c550464cf4 |
| oidc_callback | ready | oidc_callback_valid | path=/api/v1/auth/callback |
| https_policy | ready | https_policy_valid | - |
| provider_origins | ready | provider_origins_valid | count=2, config_hash=8655293a64ad7353 |
| model_pricing | ready | model_pricing_valid | count=2, config_hash=3df0904a048f2da4 |
| build_version | ready | build_version_immutable | fingerprint=4763a4c5502913ca |
| ports | ready | ports_valid | count=5 |
| monitoring | ready | monitoring_configuration_valid | - |
| migration | ready | required_migration_valid | version=16 |
| backup_mount | ready | backup_mount_bound | - |
| backup_path | ready | backup_path_writable | path_hash=0a9e5503c2df7797 |
| backup_retention | ready | backup_retention_valid | days=30 |
| smoke_isolation | ready | smoke_credentials_absent | - |

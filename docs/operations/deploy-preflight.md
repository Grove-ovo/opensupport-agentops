# Production Preflight

Production startup is fail-closed. Use:

```sh
AGENTOPS_ENV_FILE=.env.production npm run deploy:preflight
AGENTOPS_ENV_FILE=.env.production npm run deploy:up
```

`deploy:up` runs preflight before Compose. A `blocked` or `warning` report
returns non-zero and prevents startup. The environment file must be mode
`0600`; referenced secret files must be regular non-symlink files without
group or other permissions.

## Checks

Preflight validates:

- required production environment keys;
- password/credential length, placeholder detection, and uniqueness;
- master key, OIDC client secret, session key, and Grafana secret files;
- OIDC issuer, callback path, and public-origin consistency;
- HTTPS cookie, public scheme, and HSTS policy;
- provider origins and model pricing JSON;
- immutable build version and non-conflicting ports;
- Prometheus/Grafana configuration and localhost management binding;
- migration floor 16;
- explicit writable host backup path and retention;
- absence of `SMOKE_*` credentials.

The committed `.env.production.example` is intentionally not deployable. It
contains placeholders and empty values that preflight must block.

## Reports

Default reports:

```text
tmp/deploy-readiness.json
tmp/deploy-readiness.md
```

Statuses:

- `ready`: all required checks passed.
- `warning`: no blocker, but an operational decision is incomplete.
- `blocked`: deployment must not proceed.

Reports contain stable reason codes, key names, file mode/size, path or origin
hashes, and truncated SHA-256 fingerprints. They never contain passwords,
tokens, secret-file contents, or provider credentials.

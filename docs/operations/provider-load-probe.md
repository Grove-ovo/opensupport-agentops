# Direct Provider Load Probe

Use `perf:provider` for a bounded, direct test of an OpenAI-compatible
`chat/completions` endpoint. This probe is independent from the AgentOps
application load harness. It measures the provider path from one runner and
does not establish application capacity or multi-region performance.

## Credential Setup

The API key is required through a private regular file. The command does not
accept a key value through an argument or environment variable.

```sh
install -m 600 /dev/null /secure/path/provider-api-key
read -rsp "Provider API key: " PROVIDER_KEY; echo
printf '%s\n' "$PROVIDER_KEY" > /secure/path/provider-api-key
unset PROVIDER_KEY
chmod 600 /secure/path/provider-api-key
```

Do not reuse a credential that has appeared in chat, logs, shell history, or a
ticket. Revoke it and create a replacement before production use.

## Run

```sh
npm run perf:provider -- \
  --api-key-file /secure/path/provider-api-key \
  --base-url https://provider.example/compatible \
  --model reasoning-model \
  --json reports/production-e2e/provider-load.json \
  --markdown reports/production-e2e/provider-load.md
```

The base URL can be a provider prefix, a prefix ending in `/v1`, or the
complete `/chat/completions` endpoint. It must use HTTPS and must not contain
user info, a query string, or a fragment. The URL is never recorded in the
report.

The default profile is `3@c1,6@c2,12@c4`. Override it with `--stages`, for
example `--stages 4@c1,8@c2`. The probe also supports:

| CLI | Environment | Default |
|---|---|---:|
| `--api-key-file` | `PROVIDER_LOAD_API_KEY_FILE` | required |
| `--base-url` | `PROVIDER_LOAD_BASE_URL` | required |
| `--model` | `PROVIDER_LOAD_MODEL` | required |
| `--stages` | `PROVIDER_LOAD_STAGES` | `3@c1,6@c2,12@c4` |
| `--timeout-ms` | `PROVIDER_LOAD_TIMEOUT_MS` | `30000` |
| `--max-tokens` | `PROVIDER_LOAD_MAX_TOKENS` | `1500` |
| `--json` | `PROVIDER_LOAD_JSON_PATH` | `tmp/provider-load.json` |
| `--markdown` | `PROVIDER_LOAD_MARKDOWN_PATH` | `tmp/provider-load.md` |

The stage parser caps a run at 10 stages, 100 requests per stage, 500 requests
in total, and concurrency 16. `max_tokens` defaults to 1500 so reasoning
models have room to produce a completion while the response remains bounded.

## Stop Conditions

The probe stops dispatching new work when:

- cumulative error rate exceeds 10%;
- three consecutive authentication or rate-limit failures complete;
- any request times out.

Already in-flight requests are allowed to finish. A stopped run writes its
evidence with status `blocked` and exits non-zero.

## Evidence Contract

JSON and Markdown reports are written atomically with mode `0600`. They contain
per-request status, stable error code, HTTP status, latency, token counts, and
aggregate p50/p95/p99, throughput, and error rate. They never contain prompts,
response content, headers, credentials, the provider URL, or raw provider
errors. Both rendered reports are scanned for credential-shaped and exact key
content before and after writing.

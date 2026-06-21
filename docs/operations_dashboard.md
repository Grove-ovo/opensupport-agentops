# Operations Dashboard

The Phase 6C dashboard is a React and Vite workspace in `apps/web`. It provides
tenant-scoped Overview, Traces, Approvals, Releases, and Settings views over the
production API.

Overview metrics are read from the latest `dashboard_overview_24h`
`operational_aggregates` record produced by the Phase 6D worker.

## Safety Boundaries

- Public approval replies and release state changes require explicit
  confirmation.
- Approval delivery succeeds before PostgreSQL records the approval action.
- Release controls expose only state-machine transitions; release gate
  promotion remains authoritative.
- Settings responses expose secret presence and masked environment-reference
  hints, never plaintext or encrypted secret values.
- Trace views expose normalized summaries, immutable version IDs, evidence
  references, transitions, and delivery status without raw provider payloads.

## Local Commands

```sh
npm run dev:web
npm run build:web
npm run test:web
npm run test:web:e2e
```

Vite proxies `/api` and `/health` to the API service on `127.0.0.1:8080`.
Production deployment serves the generated `apps/web/dist` assets through the
Phase 6E reverse proxy.

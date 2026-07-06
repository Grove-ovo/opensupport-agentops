# OpenSupport AgentOps

Tenant-ready ecommerce customer support AgentOps application
built around Chatwoot, deterministic safety gates, immutable execution
snapshots, replay evaluation, and controlled runtime modes.

## Agent Memory Reliability Sprint

I use this repository as a production-style proof point for agent reliability:
typed traces, replay evals, guarded side effects, security cases, cost reports,
operator approvals, and rollback/runbook discipline.

For teams shipping AI agents, I offer a **USD 12,000 fixed-fee Agent Memory
Reliability Sprint** for one production-relevant workflow: memory taxonomy,
permission/staleness threat model, 8-12 replay tests, scorecard, and a concrete
implementation path in 10 business days.

- [Sprint details](./docs/services/agent-memory-reliability-sprint.md)
- [Proof pack](./docs/services/proof-pack.md)
- [Sample sprint report](./docs/services/sample-memory-sprint-report.md)
- [Start an intake issue](https://github.com/Grove-ovo/opensupport-agentops/issues/new?template=agent-memory-reliability-sprint.yml)

## OpenSupport AgentOps Pilot

For ecommerce teams using Chatwoot or planning a self-hosted support stack, I
offer a **USD 15,000 fixed-fee deployment pilot**: connect one support workflow,
run guarded shadow/assist mode, install replay/security evals, and produce a
go/no-go rollout plan.

- [Pilot details](./docs/services/opensupport-agentops-pilot.md)
- [Buyer due diligence](./docs/services/buyer-due-diligence.md)
- [Start a pilot intake issue](https://github.com/Grove-ovo/opensupport-agentops/issues/new?template=opensupport-agentops-pilot.yml)

## Project Status

The repository implements the original PRD through production-oriented Phase 6
and is ready for staging deployment through pre-deployment hardening Phase 7:

- Chatwoot Agent Bot/webhook normalization, signature verification, dedupe,
  and outbound delivery contracts.
- Tenant-scoped BYOK model configuration with local envelope encryption.
- PII masking, trace/version snapshots, LLM call logging, and cost governance.
- Code routing, conditional triage, PostgreSQL FTS + pgvector retrieval,
  evidence gates, typed mock business tools, and rule-first risk guardrails.
- Shadow, Assist, and Auto execution with guarded Chatwoot delivery,
  immutable approval snapshots, approval actions, and human edit tracking.
- Replay and security evaluation, release-candidate state machines, release
  gates, failure buckets, and reproducible reports.
- Deterministic V0-V3 architecture benchmarks and an in-process application
  load harness with bounded concurrency.
- Deployable Fastify API, real provider adapters, PostgreSQL/Redis persistence,
  and Chatwoot end-to-end execution.
- Responsive operator Dashboard for traces, approvals, releases, and safe
  tenant/model configuration.
- Redis Streams worker with outbox publication, durable leases, retries, dead
  letters, eval materialization, and Dashboard aggregation.
- Multi-stage images, production Compose, Nginx routing, Prometheus/Grafana,
  structured logs, health probes, backup/restore, rollout, rollback, incident,
  and credential-rotation procedures.
- Pre-deployment hardening: OIDC operator access, edge transport security,
  fail-closed deployment preflight, CI full-stack + supply-chain security
  (Trivy + SPDX SBOM), backup/restore recovery drill, and an aggregate
  go/no-go staging gate with residual-risk documentation.

The deployment is self-hosted and production-style, but it is not a complete
multi-user SaaS control plane. Billing, public signup, full RBAC, formal
compliance certification, Kubernetes automation, and real commerce mutations
remain out of scope.

## Architecture

- [System architecture](./docs/architecture.md)
- [ADR-001: MVP architecture](./docs/adr/ADR-001-opensupport-agentops-mvp-architecture.md)
- [ADR-002: controlled launch architecture](./docs/adr/ADR-002-controlled-launch-architecture.md)
- [Agent pipeline](./docs/agent_pipeline.md)
- [Runtime modes](./docs/runtime_modes.md)
- [Approval flow](./docs/approval_flow.md)
- [Eval framework](./docs/eval_framework.md)
- [Release gate](./docs/release_gate.md)
- [Benchmark framework](./docs/benchmark_framework.md)
- [Operations Dashboard](./docs/operations_dashboard.md)
- [Async monitor worker](./docs/async_monitor_worker.md)
- [Deployment runbook](./docs/operations/deployment-runbook.md)
- [Operator authentication](./docs/operator_authentication.md)
- [Edge and transport security](./docs/edge_transport_security.md)
- [Production preflight](./docs/operations/deploy-preflight.md)
- [Cloudflare temporary deploy](./docs/operations/cloudflare-temporary-deploy.md)

## Repository Layout

```text
apps/api                 Fastify production API and Chatwoot/LLM runtime
apps/web                 React/Vite operator Dashboard
apps/worker              Redis Streams monitor/eval/aggregation worker
packages/agent-core      Deterministic routing and pipeline contracts
packages/agent-runtime   RAG/tool/risk/response orchestration
packages/chatwoot        Chatwoot inbound and outbound connectors
packages/model-config    Tenant BYOK validation and encryption
packages/retrieval       Policy ingestion and hybrid candidate retrieval
packages/rag             Evidence merge, rerank, and retrieval gates
packages/tools           Typed deterministic business tools
packages/guardrails      Layered rule-first safety decisions
packages/runtime-*       Runtime mode and side-effect orchestration
packages/approvals       Approval snapshots and human action tracking
packages/eval            Replay, security, release, benchmark, and load helpers
packages/shared          Shared immutable contracts
infra/                   Docker, migrations, and database verification
tools/cloudflare-temporary-worker
                         Cloudflare temporary preview harness, not runtime
eval/                    Versioned replay and security datasets
reports/                 Reproducible evaluation and benchmark reports
docs/                    Architecture and implementation documentation
```

## Local Setup

Requirements:

- Node.js 22
- npm 10+
- Docker, for PostgreSQL/pgvector and Redis
- PostgreSQL client (`psql`), for migrations and live database verification

Install and validate the TypeScript workspace:

```bash
npm ci
npm run typecheck
npm test
```

Start PostgreSQL and Redis, then apply the ordered migrations:

```bash
cp .env.example .env
npm run db:up
npm run db:migrate
npm run db:verify
```

See [local runtime](./docs/local_runtime.md) and
[database schema](./docs/database_schema.md) for the complete setup and
verification commands. A separate local/self-hosted Chatwoot instance is
required for integration work.

Run the production-style stack:

```bash
cp .env.production.example .env.production
# Create secrets and replace placeholders as documented in the runbook.
docker compose --env-file .env.production \
  -f infra/docker/compose.production.yml up -d --build
```

Dashboard/API: `http://localhost:8088`
Prometheus: `http://127.0.0.1:9090`
Grafana: `http://127.0.0.1:3001`

Run the Cloudflare temporary preview harness:

```bash
npm run test:cloudflare:temporary
npm run deploy:cloudflare:temporary
```

The Cloudflare Worker target is a temporary public preview harness only. It is
not a product module and does not replace the production-style cloud server
deployment path: Node API, PostgreSQL/pgvector, Redis, Chatwoot, the async
worker, and observability still run through the self-hosted Compose topology.

## Evaluation And Reports

Committed datasets:

- [Replay cases](./eval/eval_cases.jsonl): 150 cases
- [Security cases](./eval/security_eval_cases.jsonl): 40 cases

Generated evidence:

- [Replay eval report](./reports/eval_report.md)
- [Security eval report](./reports/security_eval_report.md)
- [Failure analysis](./reports/failure_analysis.md)
- [Architecture benchmark](./reports/benchmark_report.md)
- [Application load report](./reports/load_test_report.md)
- [Cost report](./reports/cost_report.md)
- [Industrial test report — 2026-07-06](./reports/industrial_test_report_2026-07-06.md)

Reproduce the report set:

```bash
npm run reports:phase4:check
npm run reports:phase5:check
```

The Phase 5 reports use deterministic reference fixtures. They validate
architecture comparison and application-level metric semantics; they are not
production provider, billing, HTTP, or network capacity claims.

## Development Workflow

The repository is managed by Trellis:

```bash
npm run trellis:context
npm run trellis:tasks
```

Branch policy:

- `main`: stable, fully verified milestones.
- `dev`: integration branch for completed feature work.
- `feat/*`: one Trellis task or coherent feature per branch.

Every implementation task is checked, committed, archived, and merged with a
non-fast-forward merge. GitHub CI runs type-check, diff validation, and the
full deterministic test/report chain.

## Security

- Real `.env` files, credentials, build output, and dependencies are ignored.
- Provider and Chatwoot secrets are represented by references in persisted
  contracts.
- Benchmark and failure records retain safe references, hashes, and normalized
  metrics rather than customer text or provider payloads.
- The example local credentials in `.env.example` are development defaults
  only and must be replaced outside local development.

## License

[MIT](./LICENSE)

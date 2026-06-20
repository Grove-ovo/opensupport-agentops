# OpenSupport AgentOps

Tenant-ready ecommerce customer support AgentOps reference implementation
built around Chatwoot, deterministic safety gates, immutable execution
snapshots, replay evaluation, and controlled runtime modes.

## Project Status

The repository implements the original PRD through Phase 5:

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

This is not yet a production SaaS deployment. The repository does not include
a production AgentOps HTTP service, dashboard UI, live model-provider
benchmarks, real commerce mutations, or production Chatwoot end-to-end tests.

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

## Repository Layout

```text
apps/api                 Reserved backend API boundary
apps/web                 Reserved operator dashboard boundary
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

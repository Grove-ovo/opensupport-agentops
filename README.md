# OpenSupport AgentOps

Tenant-ready ecommerce customer support AgentOps platform based on Chatwoot.

This repository is managed by Trellis. Start with:

```bash
npm run trellis:context
```

Canonical planning inputs:

- [Source PRD](./OpenSupport_AgentOps_PRD.md)
- [Architecture](./docs/architecture.md)
- [ADR-001](./docs/adr/ADR-001-opensupport-agentops-mvp-architecture.md)
- [Active Trellis task PRD](./.trellis/tasks/06-16-opensupport-agentops-architecture/prd.md)

Phase 1A foundation:

- [Local Runtime](./docs/local_runtime.md)
- [Database Schema](./docs/database_schema.md)
- [Initial Migration](./infra/migrations/0001_phase1_foundation.sql)

Phase 1B connector:

- [Chatwoot Connector](./docs/chatwoot_connector.md)
- `packages/chatwoot` framework-neutral connector handlers
- `packages/shared` shared canonical event types

Phase 1C tenant model config:

- [Tenant Model Config](./docs/tenant_model_config.md)
- [Versioning Migration](./infra/migrations/0002_tenant_model_config_versions.sql)
- `packages/model-config` validation, fingerprinting, and envelope encryption
- `npm run db:verify:model-config` live PostgreSQL constraint verification

Initial workspace layout:

```text
apps/api                 AgentOps backend API
apps/web                 Operator/developer dashboard
packages/agent-core      Router, pipeline, risk, response orchestration
packages/chatwoot        Chatwoot connector and event normalization
packages/model-config    Tenant BYOK config validation and encryption
packages/rag             Hybrid retrieval and evidence gate
packages/tools           MCP-compatible typed business tools
packages/eval            Replay eval, security eval, release gate helpers
packages/shared          Shared schemas and constants
infra/                   Docker and database migration assets
docs/                    Product and architecture docs
eval/                    Eval datasets and fixtures
reports/                 Generated benchmark and analysis reports
```

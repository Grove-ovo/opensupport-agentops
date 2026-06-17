# Infra Guidelines

> Implementation contracts for local runtime, database migrations, and
> environment wiring.

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Phase 1A Database Foundation](./phase-1a-database-foundation.md) | Local runtime, migration, env, and validation contracts for the Phase 1A foundation | Active |

## Pre-Development Checklist

Before changing infra, database, or local runtime files:

- Read [Phase 1A Database Foundation](./phase-1a-database-foundation.md).
- Confirm whether the change belongs to the active Trellis phase.
- Search existing migrations and docs before adding duplicate table or env names.
- Keep secret-bearing values as references, not plaintext persisted values.

## Quality Check

Before completing infra work:

- Run `npm run test`.
- Run `npm run lint`.
- Run `docker compose -f infra/docker/compose.phase1.yml config` when compose is touched.
- Run the active Trellis task validation command.

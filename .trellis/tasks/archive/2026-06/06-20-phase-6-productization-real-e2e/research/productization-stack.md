# Productization Stack Research

## Sources

- Fastify official documentation: application factories, schema-backed routes,
  plugin encapsulation, `inject` tests, and explicit close hooks.
- React official documentation: typed components, effect cleanup, loading/error
  states, and derived state.
- node-redis official documentation: URL-based clients, `SET NX EX`, Redis
  Streams consumer groups, acknowledgements, and graceful shutdown.

## Repository Fit

- Fastify fits the existing TypeScript ESM workspace and allows the API to be
  tested without opening network sockets.
- Explicit `pg` repositories preserve the repository's SQL-first migration
  model and avoid introducing an ORM-specific schema authority.
- Redis Streams provide durable at-least-once jobs with consumer groups while
  simple `SET NX EX` keys cover canonical-event dedupe and short locks.
- React plus Vite is sufficient for an internal operations UI; server state
  remains API-owned and does not require a global client state framework.

## Selected Conventions

- Export application factories; process entrypoints only bind ports/signals.
- Validate all external HTTP input before calling domain services.
- Use transactions for state changes that also create audit or outbox records.
- Acknowledge worker messages only after durable PostgreSQL writes complete.
- Keep dead-letter metadata free of raw customer or provider payloads.
- Use `AbortController` or effect cleanup for dashboard requests.


# Technical Design

## Process Boundaries

```text
Chatwoot / Operator
        |
        v
API process ---- PostgreSQL
    |               |
    +---- Redis ----+
          |
          v
      Worker process

Web static assets -> API JSON endpoints
```

## Delivery Sequence

1. API composition, repositories, migrations, Redis coordination, health.
2. Chatwoot and provider adapters plus real inbound-to-delivery flow.
3. Operator dashboard and mutating approval/release APIs.
4. Async monitor, eval, aggregation, retry, and dead-letter processing.
5. Images, production Compose, reverse proxy, monitoring, runbooks, final E2E.

## Cross-Layer Rules

- Domain packages do not import Fastify, PostgreSQL, Redis, React, or provider
  SDKs.
- API request schemas map into project-owned types before service invocation.
- Database rows are mapped explicitly; repository callers do not depend on
  driver-specific row shapes.
- Worker jobs contain identifiers and immutable snapshot references, not raw
  customer messages.
- UI never receives provider or Chatwoot credentials.


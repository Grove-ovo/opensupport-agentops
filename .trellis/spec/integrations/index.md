# Integration Guidelines

> Executable contracts for third-party integrations and connector boundaries.

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Chatwoot Connector](./chatwoot-connector.md) | Agent Bot, account webhook, signature, dedupe, and canonical event contracts | Active |
| [Phase 3C Chatwoot Delivery](./phase-3c-chatwoot-delivery.md) | Tenant-scoped outbound notes/replies, credential references, receipts, and idempotency | Active |

## Pre-Development Checklist

Before changing integration code:

- Read the relevant integration spec.
- Confirm the active Trellis task owns the integration surface being changed.
- Keep external API assumptions documented with source links in project docs.
- Normalize external payloads at the connector boundary; downstream packages
  should consume project-owned types.

## Quality Check

Before completing integration work:

- Run `npm run typecheck`.
- Run `npm run test`.
- Run `npm run lint`.
- Run the active Trellis task validation command.

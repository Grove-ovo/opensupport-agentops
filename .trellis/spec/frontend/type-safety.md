# Type Safety

> Type safety patterns in this project.

---

## Overview

The frontend uses strict TypeScript. `types.ts` contains only safe dashboard
response shapes; backend secrets and raw payload types are intentionally absent.

---

## Type Organization

Cross-view records live in `types.ts`. API request types are declared beside
the method in `api.ts`. Props and local action unions stay beside components.

---

## Validation

Fastify validates dashboard requests. The frontend treats non-2xx responses as
`ApiError` and never casts an error envelope to a success record.

---

## Common Patterns

Use `Page<T>` for collection endpoints and `Resource<T>` for server reads.
Use literal unions for runtime modes, approval states, and release states.

---

## Forbidden Patterns

Do not use `any`, broad `Record<string, any>`, or non-null assertions for API
records. A type assertion is acceptable only at a tested JSON boundary where
the server contract is authoritative.

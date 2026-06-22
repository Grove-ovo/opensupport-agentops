# Directory Structure

> How frontend code is organized in this project.

---

## Overview

`apps/web` is the only frontend workspace. Keep transport, shared UI, hooks,
and view-specific workflows separate so operator mutations remain auditable.

---

## Directory Layout

```
apps/web/
├── e2e/                 # Playwright browser workflows
├── src/
│   ├── components/      # Shared shell, status, dialogs, state panels
│   ├── hooks/           # Reusable React stateful logic
│   ├── views/           # One file per operator view
│   ├── api.ts           # Typed HTTP boundary
│   ├── types.ts         # Safe response shapes
│   ├── App.tsx          # Tenant and view composition
│   └── styles.css       # Global responsive operations styling
└── playwright.config.ts
```

---

## Module Organization

Add a view under `src/views` when it owns a route-level workflow. Extract a
component only when it is reused or isolates a distinct accessibility or
confirmation boundary. API calls stay in `api.ts`.

---

## Naming Conventions

Use PascalCase for React component files, camelCase for hooks and utilities,
and `*.test.tsx` for Vitest tests. Browser tests use `*.spec.ts`.

---

## Examples

See `ApprovalsView.tsx`, `ConfirmDialog.tsx`, and `dashboard.spec.ts`.

# State Management

> How state is managed in this project.

---

## Overview

Tenant and active view state live in `App`. Form, filter, dialog, and selected
record state stay in their owning view.

---

## State Categories

- App state: selected tenant and view.
- View state: filters, forms, selected records, mutation progress.
- Server state: `useResource`.
- Derived state: `useMemo` only when filtering or calculation is non-trivial.

---

## When to Use Global State

Promote state to `App` only when multiple views must share it. Do not add a
store for state that has one owner.

---

## Server State

Reads retain the last successful response. Successful mutations call
`reload()` on affected resources. Mutations are not optimistically applied
because approval and release state machines are authoritative in PostgreSQL.

---

## Common Mistakes

Do not infer successful external delivery before the API returns success.
Never keep plaintext secret replacements after a settings reload.

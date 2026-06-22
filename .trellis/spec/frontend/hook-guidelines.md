# Hook Guidelines

> How hooks are used in this project.

---

## Overview

The dashboard uses React hooks without a global state library. `useResource`
is the server-read primitive for the MVP.

---

## Custom Hook Patterns

Custom hooks start with `use`, return a typed object, and keep effect cleanup
inside the hook. A loader key must contain every value that changes the
request.

---

## Data Fetching

`useResource(key, loader)` returns `data`, `loading`, `error`, `stale`,
`reload`, and `setData`. Keep prior data when refresh fails so views can show
a stale banner instead of becoming blank.

---

## Naming Conventions

Use `use<ResourceName>` for domain hooks and `useResource` for generic reads.

---

## Common Mistakes

Do not omit tenant IDs, pagination offsets, filters, or selected record IDs
from the resource key. Effects must ignore results after unmount.

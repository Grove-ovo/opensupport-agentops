# Quality Guidelines

> Code quality standards for frontend development.

---

## Overview

Every dashboard change must pass TypeScript project references, Vitest,
production Vite build, and Playwright at desktop and mobile widths.

---

## Forbidden Patterns

- Unconfirmed public replies or release transitions.
- Secret plaintext in responses, placeholders, logs, screenshots, or state.
- Viewport-width font scaling or controls that cause horizontal overflow.
- Raw SVG icons when Lucide provides the icon.

---

## Required Patterns

- Loading, empty, error, stale, and unavailable states for server reads.
- Stable dimensions for nav, tables, status badges, and icon buttons.
- Responsive validation at 1440px desktop and a Chromium mobile device.

---

## Testing Requirements

Vitest covers render, mutation confirmation, and failure states. Playwright
covers primary operator workflows and asserts no horizontal viewport overflow.
API route tests verify confirmation schemas and command translation.
Locale changes must include a parity check that English and Simplified Chinese
dictionaries expose the same keys, plus a browser or component test proving
the selected language persists across reloads.

---

## Code Review Checklist

Check tenant scoping, confirmation boundaries, secret redaction, mobile
overflow, keyboard-accessible controls, API error states, and production build
output.

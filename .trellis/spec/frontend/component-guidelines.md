# Component Guidelines

> How components are built in this project.

---

## Overview

Components are typed functions. Operator actions use explicit text or Lucide
icons and must expose accessible names. Destructive or externally visible
actions use `ConfirmDialog`.

---

## Component Structure

Define the props interface first, export the component, then keep small
file-local render helpers below it. View files own workflow state.

---

## Props Conventions

Do not use `any`. Event callbacks are named `on<Action>`. Server records come
from `types.ts`; view-local command unions stay in the view.

---

## Styling Patterns

Use classes from `styles.css`. Cards are reserved for repeated records and
bounded tools, with radius at most 6px. Dense operational pages use panels,
tables, and full-width bands.

---

## Accessibility

Icon-only buttons require `title` or `aria-label`. Dialogs require
`role="dialog"`, `aria-modal`, an accessible heading, Escape handling, and
focusable cancel/confirm actions. Tables use semantic table elements.

---

## Localization

User-facing dashboard copy must render through `useLocale().t()` and the
dictionary files in `apps/web/src/locales`. Keep backend enum values, audit
identifiers, and API payload values unchanged; translate them only at the UI
display boundary, such as `StatusBadge`.

Language controls must expose localized `aria-label` and `title` values. When
adding a new translation key, add it to both English and Simplified Chinese
dictionaries in the same change.

---

## Common Mistakes

- Do not perform approval or release mutations from an unconfirmed click.
- Do not expose raw provider payloads or stored secret values.
- Do not depend on CSS-hidden desktop controls as the only mobile control.
- Do not hard-code visible English copy in dashboard components when a locale
  dictionary key should be used.

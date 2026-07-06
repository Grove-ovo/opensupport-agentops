# Web Locale Parity CI Guard

## Goal

Make the existing English/Simplified Chinese dashboard locale parity check a
first-class repository command so future UI copy changes cannot accidentally
ship with missing translation keys.

## Requirements

- Add a deterministic Node script that validates `apps/web/src/locales/en.ts`
  and `apps/web/src/locales/zh.ts`.
- The script must fail on missing keys, extra keys, duplicate keys, and
  mismatched `{placeholder}` tokens for the same key.
- Add an npm script for the locale check.
- Ensure `npm run test:web` executes the locale check before Vitest.
- Update the industrial test report so the earlier i18n maintenance
  recommendation is marked resolved.

## Acceptance Criteria

- [x] `npm run test:web:locales` passes and reports the checked key count.
- [x] `npm run test:web` runs the locale parity check and web unit tests.
- [x] `npm test` continues to include the locale parity check through
  `test:web`.
- [x] The industrial report no longer lists locale parity CI as an open
  improvement.

## Out of Scope

- Adding more languages.
- Rewriting the locale provider or dashboard copy.
- Introducing a new test runner or package dependency.

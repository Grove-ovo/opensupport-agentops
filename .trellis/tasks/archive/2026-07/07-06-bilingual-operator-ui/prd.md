# Bilingual Operator UI

## Goal

Complete the existing frontend localization scaffold so the operator dashboard can switch freely between English and Chinese, persist the selected language, and render user-facing dashboard text through the locale dictionary.

## Requirements

- Use the existing `LocaleProvider`, dictionaries, and `LanguageSwitcher` patterns under `apps/web/src/locales`.
- Keep the language switch available from the main dashboard shell.
- Persist the selected locale in local storage and keep the HTML `lang` attribute in sync on initial load and subsequent switches.
- Replace hard-coded user-facing dashboard strings with translation keys where practical for the current MVP.
- Keep API payload values, enum values, and audit/source identifiers unchanged; only localize display labels.
- Update tests to verify language switching works and the selected language is persisted.

## Acceptance Criteria

- [x] The dashboard can switch between English and Chinese without a page refresh.
- [x] Reloading the dashboard keeps the previously selected locale.
- [x] Main navigation, dashboard headings, auth/boot states, settings, approvals, releases, trace, policy KB, and tool risk views render translated labels instead of fixed English text.
- [x] Raw backend enum values remain stable and are mapped only at the UI boundary.
- [x] Frontend type-check, lint/build, and relevant tests pass.

## Definition of Done

- Existing i18n utilities are reused rather than replaced.
- Tests cover the language switch behavior.
- No plaintext secret or provider payload behavior changes.
- Changes are committed on the current branch after verification.

## Out of Scope

- Backend response localization.
- User-generated message translation.
- New external i18n dependencies.
- Locale-specific date, number, or currency formatting beyond existing browser defaults.

## Technical Notes

- Frontend workspace: `apps/web`.
- Existing files to inspect: `apps/web/src/locales/*`, `apps/web/src/components/LanguageSwitcher.tsx`, `apps/web/src/components/AppShell.tsx`, and dashboard view files under `apps/web/src/views`.
- Relevant specs: `.trellis/spec/frontend/*` and `.trellis/spec/guides/index.md`.

## Completion Evidence

- Implemented in `a73a185`, `09261b0`, and `3d0c50f`.
- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm run test:web` passed with 7 Vitest tests.
- `npm run build:web` passed.
- `npm run test:web:e2e` passed with 10 Playwright tests across desktop and mobile.
- Full repository `npm run test` passed with elevated local-listen permission.
- Industrial test report added at `reports/industrial_test_report_2026-07-06.md`.

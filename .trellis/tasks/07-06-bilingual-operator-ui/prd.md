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

- [ ] The dashboard can switch between English and Chinese without a page refresh.
- [ ] Reloading the dashboard keeps the previously selected locale.
- [ ] Main navigation, dashboard headings, auth/boot states, settings, approvals, releases, trace, policy KB, and tool risk views render translated labels instead of fixed English text.
- [ ] Raw backend enum values remain stable and are mapped only at the UI boundary.
- [ ] Frontend type-check, lint/build, and relevant tests pass.

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

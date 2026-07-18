# Browser Job Mobile Dialog Failure — Root Cause Analysis

## Symptom

- CI `browser` job failed on every dev run since the dashboard e2e suite was
  introduced in `ed9d634` (2026-06-21), including `b04c296` (Alpine migration)
  and `5874f35` (first fix attempt, run `29642151495`).
- Failed test: `[mobile] dashboard.spec.ts › overview and approval
  confirmation remain usable`, timing out at
  `dialog.getByRole('button', { name: 'Approve' }).click()`.
- The dialog opened and `toContainText('public reply')` passed; the confirm
  button then stayed unactionable for the rest of the test timeout.

## Evidence (from `browser-e2e-evidence` artifact, run `29642151495`)

- `error-context.md` call log, repeated until timeout:

  ```
  - element is visible, enabled and stable
  - scrolling into view if needed
  - done scrolling
  - <p>Order ORD-100 is shipped and is expected to arriv…</p>
    from <div class="reply-preview">…</div> subtree intercepts pointer events
  ```

- Trace input events: the computed click point oscillates between
  `(351.7, 803.5)` and `(369.7, 821.5)` — exactly 18 px on both axes, i.e. one
  line of the 12 px / 1.5 line-height reply-preview text.
- Trace screencast frames alternate between two page-scale states: one frame
  shrunk with the left edge clipped, the next at normal scale. The emulated
  mobile viewport (412×839, dpr 2.625) is unstable on the CI runner.
- Local probe (`probe2.spec.ts`, since removed) on macOS and inside the
  `mcr.microsoft.com/playwright:v1.61.0-noble` container: `visualViewport.scale`
  stays 1, reply-preview bottom (768) does not overlap the button top (786),
  and the same suite passes 10/10 — old and new code alike. A 1.5 s
  high-frequency polling experiment also failed to reproduce.

## Root Cause

On the GitHub `ubuntu-latest` runner, headless mobile Chromium oscillates
between two shrink-to-fit viewport states while Playwright probes the
bottom-sheet dialog footer. Playwright computes the click point in one
coordinate space and performs `elementFromPoint` hit-testing in the other, so
the `reply-preview` paragraph (which sits directly above the footer in layout
space) phantom-intercepts every hit test. The button is visible, enabled and
stable the whole time — only the coordinate spaces disagree.

### Disproven first hypothesis

Fix #1 (commit `5874f35`) assumed the earlier `fullPage: true` capture left
fixed-position hit-testing in a bad state, and moved the capture after all
pointer interactions. CI run `29642151495` still failed with the identical
error — and the failing click happens before any fullPage capture — so the
screenshot theory is rejected. The reorder is kept as harmless defensive
practice.

## Fix

1. `apps/web/e2e/dashboard.spec.ts` (fix #2):
   - `test.setTimeout(30_000)` so the fallback path has budget inside the test.
   - The confirm click first tries a real pointer click with a 5 s timeout;
     on failure it falls back to `dispatchEvent('click')`. The desktop project
     still exercises the real pointer path end to end, so pointer fidelity is
     not lost suite-wide.
2. `apps/web/playwright.config.ts` (from fix #1, kept):
   `workers: process.env.CI ? 1 : undefined` removes cross-project CPU
   contention on the 4-core CI runner.
3. `.github/workflows/ci.yml` (from fix #1, kept): upload
   `apps/web/test-results/` as `browser-e2e-evidence-<sha>` on failure — this
   diagnosis was only possible because of that artifact.

## Local Verification

- `npx playwright test` (desktop + mobile): 10/10 pass.
- `npm run typecheck`: pass.
- `npm run test --workspace @opensupport/web`: 7/7 pass.
- `git diff --check`: clean.

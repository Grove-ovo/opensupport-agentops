# GitHub Release Readiness

## Scenario: Publish A Verified Private Repository

### 1. Scope / Trigger

- Trigger: changes to the root README, repository license, GitHub CI, release
  branch policy, or first remote publication.
- Applies to `README.md`, `LICENSE`, `.github/workflows/ci.yml`, and
  `scripts/validate-release-readiness.mjs`.

### 2. Signatures

```text
npm run test:release
npm run typecheck
npm run lint
npm test
```

### 3. Contracts

- README must distinguish implemented deterministic capabilities from
  unimplemented production HTTP, UI, provider, and end-to-end boundaries.
- README relative links must resolve to committed files.
- `package.json` MIT metadata and the root `LICENSE` must agree.
- CI runs on pushes to `main` and `dev` plus pull requests using Node 22.
- CI installs with `npm ci`, then runs type-check, diff validation, and the
  full test/report chain.
- `main` is stable, `dev` is integration, and `feat/*` branches are
  task-scoped.
- The first GitHub repository is private unless the user explicitly chooses
  public visibility.
- Real environment files, secrets, build output, dependencies, and local
  Trellis runtime state remain untracked.

### 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| Missing README section or boundary | release validator fails |
| Broken relative README link | release validator fails |
| License metadata mismatch | release validator fails |
| Missing CI quality command | release validator fails |
| Secret-bearing tracked file | block publication |
| GitHub authentication unavailable | keep local release ready; do not push |

### 5. Good / Base / Bad Cases

- Good: private repository receives verified `main` and `dev`.
- Base: GitHub login is unavailable; local commits and branches remain ready
  without pretending publication succeeded.
- Bad: merging `dev` to `main` before the full deterministic test/report chain
  passes.

### 6. Tests Required

- Run the release validator and resolve every README link.
- Run type-check, lint, and full tests before merging to `main`.
- Scan tracked paths and contents for environment files, private keys, and
  credential patterns.
- Verify `main` contains `dev` before push.
- Verify remote branch heads after push.

### 7. Wrong vs Correct

#### Wrong

```text
push dev directly and call the project production-ready
```

#### Correct

```text
verify feature -> merge to dev -> verify dev -> merge to main -> push both
```

Published documentation must describe evidence and remaining boundaries
accurately.

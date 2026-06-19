# Phase 4A Eval Contracts And Datasets

## Scenario: Versioned Safe Evaluation Inputs

### 1. Scope / Trigger

- Trigger: changes to eval/security case schemas, JSONL fixtures, loader
  validation, or eval run/result persistence.
- Applies to `packages/shared/src/eval.ts`, `packages/eval`, committed eval
  JSONL, migration `0010`, and `docs/eval_framework.md`.
- Does not execute candidates, calculate release gates, or promote releases.

### 2. Signatures

```ts
parseReplayDataset(jsonl: string): ParsedEvalDataset<EvalCase>
parseSecurityDataset(jsonl: string): ParsedEvalDataset<SecurityEvalCase>
loadReplayDatasetFile(path: string): Promise<ParsedEvalDataset<EvalCase>>
loadSecurityDatasetFile(path: string): Promise<ParsedEvalDataset<SecurityEvalCase>>
```

### 3. Contracts

- Replay IDs use `replay-NNNN`; security IDs use `security-NNNN`.
- One file contains one dataset version and unique case IDs.
- Splits are `dev`, `test`, or `regression`.
- Inputs are masked/support-safe text and never persisted by migration `0010`.
- Replay expectations define intent, action, grounding/tools, runtime ceiling,
  latency, cost, and tags.
- Security expectations define attack category, P0 status, required safe
  action, forbidden actions/tools, unauthorized access, and PII safety.
- Case, run, and result DB rows are immutable and tenant scoped.

### 4. Validation & Error Matrix

| Condition | Behavior |
|-----------|----------|
| Invalid JSON row | `invalid_json` |
| Empty/invalid case | `invalid_case` |
| Duplicate case ID | `duplicate_case` |
| Mixed dataset versions | `mixed_dataset_version` |
| Direct PII/credential fixture | `unsafe_fixture` |
| Cross-tenant result/run | PostgreSQL foreign-key failure |
| Case/run/result update or delete | PostgreSQL check violation |

### 5. Good/Base/Bad Cases

- Good: a return-policy replay case requires an immutable evidence ID.
- Base: an unknown request expects clarification with no evidence/tool.
- Bad: store a raw email, phone, card, API key, or customer transcript.
- Bad: mix candidate execution logic into the dataset loader.

### 6. Tests Required

- Assert exactly 150 replay and 40 security cases.
- Assert required split counts and unique IDs.
- Cover invalid JSON, duplicates, mixed versions, invalid enums, missing
  evidence, direct PII, and credential patterns.
- Run migration twice and live eval foundation verification.
- Run lint, typecheck, full tests, static validation, and Trellis validation.

### 7. Wrong vs Correct

#### Wrong

```json
{"input":"Email user@example.com and use sk-live-secret"}
```

#### Correct

```json
{"masked_input":"Contact [EMAIL_1] about order ORDER-1001"}
```

Evaluation fixtures preserve behavior without carrying sensitive values.

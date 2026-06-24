# Phase 7 Multi-Turn Eval

## Scenario: Multi-Turn Conversation Evaluation

### 1. Scope / Trigger

- Trigger: changes to multi-turn eval cases, the multi-turn runner, or the
  conversation-complexity test scope.
- Applies to `packages/shared/src/eval.ts` (MultiTurnEvalCase types),
  `packages/eval/src/dataset.ts` (parseMultiTurnDataset),
  `packages/eval/src/multi-turn.ts` (runner + metrics), and
  `eval/multiturn_eval_cases.jsonl`.

### 2. Signatures

```text
npm run test:phase7-multiturn
```

```ts
parseMultiTurnDataset(jsonl): ParsedEvalDataset<MultiTurnEvalCase>
MultiTurnEvalRunner.run(command): MultiTurnEvalResult
calculateMultiTurnMetrics(caseResults): MultiTurnEvalMetrics
evaluateTurnBehavior(turn, observation): { passed, reason_codes, context_lost }
```

### 3. Contracts

- **Each turn is an isolated pipeline execution.** The system's agent pipeline
  is stateless — it does not load conversation history. Each turn in a
  multi-turn case runs as a fresh `EvalCandidateExecutor.execute()` call with
  only that turn's `masked_input`. This faithfully exposes the stateless
  limitation: turns 2+ that reference prior context will likely fail.
- **`context_loss_rate` is the headline metric.** It measures the fraction of
  turns where the observed intent or action differs from the expected value —
  i.e., the system "lost context" because it could not see the prior turn. A
  high `context_loss_rate` quantifies the multi-turn gap.
- **Turn-level assertions.** Each turn has its own `expected_intent`,
  `expected_action`, and `required_tool_names`. A case passes only if ALL
  turns pass. A case with context loss on turn 2 fails, even if turn 1
  succeeds.
- **Cases model real customer behavior.** 20 cases cover: order-status
  follow-ups without repeating order numbers, refund escalation from
  eligibility to filing, logistics tracking chain, incomplete information with
  clarification cycles, topic switches mid-conversation, emotional escalation,
  multi-order confusion, and cross-order refund inquiries.
- **Dataset schema.** `MultiTurnEvalCase` has `turns[]` (2-5 turns), each with
  `turn` (sequential from 1), `masked_input`, `expected_intent`,
  `expected_action`, `required_tool_names`, and `note`. Cases use
  `case_id: multiturn-NNNN` and `dataset_version: phase7-multiturn-v1`.
- **Safety checks.** Each turn's `masked_input` passes the same PII/credential
  fixture safety scan as single-turn replay cases.

### 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| Turn count < 2 or > 5 | `invalid_case` |
| Turn numbers not sequential from 1 | `invalid_case` |
| PII or credential in masked_input | `unsafe_fixture` |
| Invalid intent/action enum | `invalid_case` |
| Duplicate case_id | `duplicate_case` |
| Mixed dataset_version | `mixed_dataset_version` |
| Intent mismatch on turn 2+ | `context_lost = true`, `intent_mismatch` |
| Action mismatch on turn 2+ | `context_lost = true`, `action_mismatch` |

### 5. Good / Base / Bad Cases

- Good: a 2-turn case where turn 1 succeeds and turn 2 also succeeds (the
  follow-up was self-contained enough for the stateless pipeline).
- Base: a 3-turn case where turn 1 passes but turn 2 fails with context loss —
  the `context_loss_rate` metric captures this, documenting the gap.
- Bad: assume the multi-turn runner carries conversation history between turns
  — it does not; each turn is isolated.

### 6. Tests Required

- Runner tests (`packages/eval/src/multi-turn.test.ts`): all-turns-pass,
  context-loss detection, metrics aggregation, evaluateTurnBehavior (intent
  mismatch = context_lost, tool mismatch ≠ context_lost), idempotency
  conflict.
- Dataset tests (`packages/eval/src/dataset.test.ts`): load 20 committed cases,
  verify split counts (dev=8, test=6, regression=6), turn count 2-5,
  sequential turn numbers; reject invalid turn structure.

### 7. Wrong vs Correct

### Wrong

```ts
// assume the runner maintains conversation state between turns
observation = await executor.execute({ ...turn1, history: previousObservations });
```

### Correct

```ts
// each turn is a fresh, stateless execution — this is the current system behavior
observation = await executor.execute({ ...turnN });
```

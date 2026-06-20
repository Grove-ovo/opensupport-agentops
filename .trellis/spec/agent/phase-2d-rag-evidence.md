# Phase 2D RAG Evidence Pipeline

## Scenario: Deterministic Evidence Gating

### 1. Scope / Trigger

- Trigger: changes to hybrid candidate merge, rerank, evidence thresholds,
  evidence IDs, retrieval failure reasons, or baseline retrieval metrics.
- Applies to `packages/shared/src/evidence.ts`, `packages/rag`,
  `docs/rag_pipeline.md`, and `reports/rag_eval_baseline.md`.
- Does not authorize response generation, tool execution, release gates, or
  runtime-mode delivery.

### 2. Signatures

```ts
runRAGEvidencePipeline(
  input: RunRAGPipelineInput,
  adapters: RAGPipelineAdapters,
): Promise<EvidenceBundle>

evaluateRAGBaseline(
  cases: readonly RAGBaselineCase[],
): RAGBaselineMetrics
```

```text
npm run test:phase2d
npm run test:rag
npm run db:verify:retrieval
```

### 3. Contracts

- Query rewrite and candidate retrieval are injected adapters; provider
  payloads never enter evidence records.
- Tenant, policy version, and retrieval config version must be explicit and
  consistent.
- Query rewrite is optional, length-bounded, and limited to three times the
  normalized input length.
- `EvidenceBundle` preserves raw lexical/vector candidates, merged scores,
  rerank scores, thresholds, evidence IDs, and the gate result.
- Evidence IDs hash immutable tenant, policy, retrieval config, chunk, and
  content hash values.
- Threshold-passing document injection, stale versions, conflicts, and no
  evidence are blocking.
- Blocking never removes the audit candidates that caused the decision.

### 4. Validation & Error Matrix

| Condition | Expected behavior |
|-----------|-------------------|
| Invalid or inconsistent scope IDs | `RAGValidationError: invalid_scope` |
| Invalid weights, limits, threshold, dimensions | `invalid_config` |
| Empty or oversized query | `invalid_query` |
| Rewrite exceeds bounded expansion | `invalid_rewrite` |
| Retriever returns another tenant/version | `stale_version`, blocking |
| Threshold-passing injected document | `injected_document`, blocking |
| Valid evidence contains conflicting policy facts | `conflict_detected`, blocking |
| No safe threshold-passing evidence | `no_evidence`, blocking |
| Valid consistent evidence | `evidence_valid`, allowing |

### 5. Good/Base/Bad Cases

- Good: preserve lexical and vector scores for the same chunk, rerank once, and
  emit one deterministic evidence citation.
- Good: retain conflicting evidence citations while blocking the policy claim.
- Base: no rewrite adapter uses the normalized query unchanged.
- Bad: drop stale or injected candidates before they can be audited.
- Bad: generate policy prose from a bundle with `gate.blocking=true`.

### 6. Tests Required

- Tests cover query normalization and bounded rewrite.
- Tests cover weighted merge, deterministic ordering, rerank, threshold, and
  stable evidence IDs.
- Tests cover stale tenant/version, no evidence, document injection, policy
  conflicts, and inconsistent duplicate candidate records.
- Baseline tests calculate Recall@5 and Evidence Hit Rate on a fixed set.
- Static validation asserts shared contracts, docs, report, scripts, and spec.
- Run lint, type-check, full tests, retrieval database verification, and
  active Trellis validation.

### 7. Wrong vs Correct

#### Wrong

```ts
if (bundle.evidence.length > 0) {
  return answerPolicyQuestion(bundle.evidence);
}
```

This ignores stale, injected, or conflicting evidence that can coexist with
safe-looking citations.

#### Correct

```ts
if (bundle.gate.blocking) {
  return { action: 'clarify_or_handoff', evidence: bundle.evidence };
}
```

The gate remains authoritative while evidence stays available for trace and
human inspection.

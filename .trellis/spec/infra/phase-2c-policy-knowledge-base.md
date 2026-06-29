# Phase 2C Policy Knowledge Base Interface (PRD 17.4)

## 1. Scope / Trigger

- Trigger: changes to the policy KB operator API routes, the
  `OperationsService` policy methods, or the Knowledge Dashboard view.
- Applies to `apps/api/src/operations.ts` (policy methods),
  `apps/api/src/operations-routes.ts` (policy routes),
  `apps/api/src/contracts.ts` (policy record types),
  `apps/web/src/views/PolicyKBView.tsx`, and
  `apps/web/src/api.ts` (policy methods).
- The underlying schema lives in
  `infra/migrations/0005_policy_corpus_hybrid_retrieval.sql`; this spec covers
  the **operator integration layer** built on top of it, not the schema itself.

## 2. Signatures

```text
GET  /api/v1/tenants/:tenantId/policy-versions
GET  /api/v1/tenants/:tenantId/policy-versions/:policyVersionId/documents
POST /api/v1/tenants/:tenantId/policy-versions
PUT  /api/v1/tenants/:tenantId/policy-versions/:policyVersionId/publish
POST /api/v1/tenants/:tenantId/policy-retrieval-smoke-test
```

```ts
createPolicyVersion(tenantId, { name, documents, actorId }): Promise<PolicyVersionSummaryRecord>
publishPolicyVersion(tenantId, policyVersionId, actorId): Promise<PolicyVersionSummaryRecord>
runRetrievalSmokeTest(tenantId, { query, limit? }): Promise<readonly RetrievalSmokeTestResult[]>
```

## 3. Contracts

- **Upload = plan + persist.** `createPolicyVersion` calls
  `createPolicyIngestionPlan` (from `@opensupport/retrieval`) to normalize and
  chunk the documents, then INSERTs the resulting `policy_documents` and
  `policy_chunks` inside a single transaction. The version starts as `draft`.
- **Draft→Published lifecycle.** Documents can only be added to draft
  versions (the `guard_policy_content_mutation()` trigger rejects otherwise).
  `publishPolicyVersion` transitions `draft→published`; the DB enforces one
  published version per tenant (partial unique index). Publishing makes content
  immutable.
- **Smoke test uses lexical retrieval.** `runRetrievalSmokeTest` resolves the
  tenant's active published version and calls the
  `search_policy_chunks_lexical` SQL function. Vector search requires
  embeddings and is out of scope for the MVP smoke test.
- **All routes are tenant-scoped operator endpoints.** The `preHandler` hook
  calls `operatorAccess.assertTenant` for tenant authorization; mutation routes
  additionally use `mutationGuards` (CSRF + actor-identity forge protection).
- **Audit trail.** `createPolicyVersion` and `publishPolicyVersion` call
  `this.audit(...)` to record an `audit_logs` entry.
- **Evidence ids (MVP proxy).** The `EvidenceRef` / `EvidenceBundle` concept is
  Phase 2D and not yet implemented at runtime. Until it exists, the Dashboard
  surfaces document/chunk metadata (source_key, content_hash, chunk_count) as
  the "evidence" view — proving the corpus content is accessible and queryable.

## 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| Empty documents array on create | `policy_documents_required` (400) |
| Publish a non-existent version | `policy_version_not_found` (404) |
| Publish a version that is not draft | `policy_version_not_draft` (409) |
| Smoke test with no published version | `no_published_policy_version` (409) |
| Mutate published policy content | DB `guard_policy_content_mutation` trigger blocks |
| Two published versions for one tenant | DB partial unique index violation |

## 5. Good / Base / Bad Cases

- Good: upload a document via the Dashboard, create a draft version, publish
  it, then run a retrieval smoke test that returns ranked chunks.
- Base: a tenant with zero policy versions — the versions panel shows an empty
  state directing the operator to upload.
- Bad: attempt to INSERT policy_documents directly via SQL into a published
  version (bypasses the operator API and is rejected by the trigger).
- Bad: mutate `agent_traces` or skip the `audit_logs` write on policy create /
  publish.

## 6. Tests Required

- Route tests (`apps/api/src/operations-routes.test.ts`): list versions, list
  documents, create version (asserts the forwarded command + actor identity),
  publish, and smoke test — all against a `FakeOperations`.
- Frontend test (`apps/web/src/App.test.tsx`): `mockFetch` branches for the
  policy-version and smoke-test URLs.
- The retrieval package itself (`packages/retrieval/src/retrieval.test.ts`) and
  the SQL verification (`infra/verification/phase2c_policy_retrieval.sql`)
  remain the coverage for the underlying plan/chunk/search behavior.

## 7. Wrong vs Correct

### Wrong

```sh
psql -c "INSERT INTO policy_documents ..."  # bypasses normalization + chunking
```

### Correct

```sh
POST /api/v1/tenants/:tenantId/policy-versions
  { "name": "Returns policy",
    "documents": [{ "source_key": "returns.md", "title": "Returns", "content": "..." }] }
```

The API normalizes, chunks, and persists inside a transaction, then the operator
publishes via the PUT endpoint.

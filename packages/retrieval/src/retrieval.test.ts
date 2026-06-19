import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  PolicySourceDocument,
  RetrievalChunkRecord,
} from '@opensupport/shared';
import {
  RetrievalValidationError,
  createPolicyIngestionPlan,
  retrieveLexicalCandidates,
  retrieveVectorCandidates,
} from './index.js';

const tenantId = '018f7f4a-7c1d-7b22-8d41-1234567890aa';
const otherTenantId = '018f7f4a-7c1d-7b22-8d41-1234567890ab';
const policyVersionId = '018f7f4a-7c1d-7b22-8d41-1234567890ac';

const documents: PolicySourceDocument[] = [
  {
    source_key: 'returns.md',
    title: ' Returns ',
    media_type: 'TEXT/MARKDOWN',
    content:
      'Returns are accepted within 30 days.\\r\\n\\r\\nItems must be unused. '.repeat(
        6,
      ),
    metadata: { locale: 'en-US' },
  },
  {
    source_key: 'shipping.md',
    title: 'Shipping',
    media_type: 'text/markdown',
    content: '标准配送需要 3 到 5 个工作日。',
    metadata: { locale: 'zh-CN' },
  },
];

test('creates a deterministic ingestion plan independent of input order', () => {
  const first = createPolicyIngestionPlan({
    tenantId,
    policyVersionId,
    documents,
    maxChunkChars: 160,
    overlapChars: 24,
  });
  const second = createPolicyIngestionPlan({
    tenantId,
    policyVersionId,
    documents: [...documents].reverse(),
    maxChunkChars: 160,
    overlapChars: 24,
  });

  assert.deepEqual(first, second);
  assert.deepEqual(
    first.documents.map((document) => document.source_key),
    ['returns.md', 'shipping.md'],
  );
  assert.ok(first.chunks.length > first.documents.length);
  assert.equal(new Set(first.chunks.map((chunk) => chunk.id)).size, first.chunks.length);
  assert.match(first.content_hash, /^[a-f0-9]{64}$/u);
});

test('includes normalized document metadata in the aggregate policy hash', () => {
  const first = createPolicyIngestionPlan({
    tenantId,
    policyVersionId,
    documents: [
      {
        ...(documents[0] as PolicySourceDocument),
        metadata: { nested: { beta: 2, alpha: 1 }, locale: 'en-US' },
      },
    ],
  });
  const equivalent = createPolicyIngestionPlan({
    tenantId,
    policyVersionId,
    documents: [
      {
        ...(documents[0] as PolicySourceDocument),
        metadata: { locale: 'en-US', nested: { alpha: 1, beta: 2 } },
      },
    ],
  });
  const changed = createPolicyIngestionPlan({
    tenantId,
    policyVersionId,
    documents: [
      {
        ...(documents[0] as PolicySourceDocument),
        metadata: { locale: 'en-GB', nested: { alpha: 1, beta: 2 } },
      },
    ],
  });

  assert.equal(first.content_hash, equivalent.content_hash);
  assert.notEqual(first.content_hash, changed.content_hash);
});

test('deduplicates identical sources and rejects conflicting duplicates', () => {
  const identical = createPolicyIngestionPlan({
    tenantId,
    policyVersionId,
    documents: [documents[0] as PolicySourceDocument, documents[0] as PolicySourceDocument],
  });
  assert.equal(identical.documents.length, 1);

  assert.throws(
    () =>
      createPolicyIngestionPlan({
        tenantId,
        policyVersionId,
        documents: [
          documents[0] as PolicySourceDocument,
          {
            ...(documents[0] as PolicySourceDocument),
            content: 'Conflicting content',
          },
        ],
      }),
    (error: unknown) =>
      error instanceof RetrievalValidationError &&
      error.code === 'duplicate_source',
  );
});

test('returns tenant-scoped lexical candidates in deterministic score order', () => {
  const chunks = candidateChunks();
  const results = retrieveLexicalCandidates({
    tenantId,
    policyVersionId,
    query: 'return policy unused',
    chunks,
    limit: 5,
  });

  assert.deepEqual(
    results.map((candidate) => candidate.chunk_id),
    ['chunk-return'],
  );
  assert.ok(results.every((candidate) => candidate.tenant_id === tenantId));
  assert.ok(results.every((candidate) => candidate.source === 'lexical'));
});

test('returns cosine vector candidates and ignores other tenants', () => {
  const results = retrieveVectorCandidates({
    tenantId,
    policyVersionId,
    queryEmbedding: unitVector(0),
    chunks: candidateChunks(),
    limit: 5,
  });

  assert.deepEqual(
    results.map((candidate) => candidate.chunk_id),
    ['chunk-return', 'chunk-shipping'],
  );
  assert.equal(results[0]?.score, 1);
  assert.ok(results.every((candidate) => candidate.tenant_id === tenantId));
});

test('rejects unsafe identifiers, chunking settings, and embedding shapes', () => {
  assert.throws(
    () =>
      createPolicyIngestionPlan({
        tenantId: 'not-a-uuid',
        policyVersionId,
        documents,
      }),
    RetrievalValidationError,
  );
  assert.throws(
    () =>
      createPolicyIngestionPlan({
        tenantId,
        policyVersionId,
        documents,
        maxChunkChars: 127,
      }),
    (error: unknown) =>
      error instanceof RetrievalValidationError &&
      error.code === 'invalid_chunking',
  );
  assert.throws(
    () =>
      retrieveVectorCandidates({
        tenantId,
        policyVersionId,
        queryEmbedding: [1, 0],
        chunks: candidateChunks(),
        limit: 5,
      }),
    (error: unknown) =>
      error instanceof RetrievalValidationError &&
      error.code === 'invalid_embedding',
  );
});

function candidateChunks(): RetrievalChunkRecord[] {
  return [
    {
      id: 'chunk-return',
      tenant_id: tenantId,
      policy_version_id: policyVersionId,
      document_id: 'document-return',
      chunk_index: 0,
      char_start: 0,
      char_end: 48,
      content: 'The return policy accepts unused items within 30 days.',
      content_hash: 'a'.repeat(64),
      token_count: 9,
      embedding: unitVector(0),
    },
    {
      id: 'chunk-shipping',
      tenant_id: tenantId,
      policy_version_id: policyVersionId,
      document_id: 'document-shipping',
      chunk_index: 0,
      char_start: 0,
      char_end: 37,
      content: 'Standard shipping takes five business days.',
      content_hash: 'b'.repeat(64),
      token_count: 6,
      embedding: vectorWithValues([0.8, 0.2]),
    },
    {
      id: 'chunk-other-tenant',
      tenant_id: otherTenantId,
      policy_version_id: policyVersionId,
      document_id: 'document-other',
      chunk_index: 0,
      char_start: 0,
      char_end: 50,
      content: 'Return policy permits refunds for every other tenant.',
      content_hash: 'c'.repeat(64),
      token_count: 8,
      embedding: unitVector(0),
    },
  ];
}

function unitVector(index: number): number[] {
  const values = Array.from({ length: 1536 }, () => 0);
  values[index] = 1;
  return values;
}

function vectorWithValues(prefix: readonly number[]): number[] {
  return [
    ...prefix,
    ...Array.from({ length: 1536 - prefix.length }, () => 0),
  ];
}

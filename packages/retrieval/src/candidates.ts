import type {
  RetrievalCandidate,
  RetrievalChunkRecord,
} from '@opensupport/shared';
import { isUuid } from '@opensupport/shared';
import { RetrievalValidationError } from './errors.js';

const EMBEDDING_DIMENSIONS = 1536;

export interface LexicalCandidateInput {
  tenantId: string;
  policyVersionId: string;
  query: string;
  chunks: readonly RetrievalChunkRecord[];
  limit: number;
}

export interface VectorCandidateInput {
  tenantId: string;
  policyVersionId: string;
  queryEmbedding: readonly number[];
  chunks: readonly RetrievalChunkRecord[];
  limit: number;
}

export function retrieveLexicalCandidates(
  input: LexicalCandidateInput,
): RetrievalCandidate[] {
  validateScope(input.tenantId, input.policyVersionId);
  validateLimit(input.limit);
  const query = input.query.normalize('NFKC').trim().toLowerCase();
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    throw new RetrievalValidationError(
      'invalid_query',
      'lexical query must contain searchable tokens',
    );
  }

  const queryTokenSet = new Set(queryTokens);
  return scopedChunks(input)
    .map((chunk) => {
      const chunkTokens = tokenize(chunk.content);
      const matchingTokens = new Set(
        chunkTokens.filter((token) => queryTokenSet.has(token)),
      );
      const coverage = matchingTokens.size / queryTokenSet.size;
      const phraseBonus = chunk.content
        .normalize('NFKC')
        .toLowerCase()
        .includes(query)
        ? 0.15
        : 0;
      return candidate(chunk, 'lexical', Math.min(1, coverage + phraseBonus));
    })
    .filter((result) => result.score > 0)
    .sort(compareCandidates)
    .slice(0, input.limit);
}

export function retrieveVectorCandidates(
  input: VectorCandidateInput,
): RetrievalCandidate[] {
  validateScope(input.tenantId, input.policyVersionId);
  validateLimit(input.limit);
  validateEmbedding(input.queryEmbedding, 'queryEmbedding');

  return scopedChunks(input)
    .filter(
      (
        chunk,
      ): chunk is RetrievalChunkRecord & { embedding: readonly number[] } =>
        chunk.embedding !== null,
    )
    .map((chunk) => {
      validateEmbedding(chunk.embedding, `chunk ${chunk.id} embedding`);
      if (chunk.embedding.length !== input.queryEmbedding.length) {
        throw new RetrievalValidationError(
          'invalid_embedding',
          `chunk ${chunk.id} embedding dimensions do not match the query`,
        );
      }
      const cosine = cosineSimilarity(input.queryEmbedding, chunk.embedding);
      return candidate(chunk, 'vector', Math.max(0, Math.min(1, cosine)));
    })
    .sort(compareCandidates)
    .slice(0, input.limit);
}

function scopedChunks(input: {
  tenantId: string;
  policyVersionId: string;
  chunks: readonly RetrievalChunkRecord[];
}): RetrievalChunkRecord[] {
  return input.chunks.filter(
    (chunk) =>
      chunk.tenant_id === input.tenantId &&
      chunk.policy_version_id === input.policyVersionId,
  );
}

function candidate(
  chunk: RetrievalChunkRecord,
  source: RetrievalCandidate['source'],
  score: number,
): RetrievalCandidate {
  return {
    tenant_id: chunk.tenant_id,
    policy_version_id: chunk.policy_version_id,
    document_id: chunk.document_id,
    chunk_id: chunk.id,
    chunk_index: chunk.chunk_index,
    content: chunk.content,
    content_hash: chunk.content_hash,
    source,
    score,
  };
}

function cosineSimilarity(
  left: readonly number[],
  right: readonly number[],
): number {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] as number;
    const rightValue = right[index] as number;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }
  return dot / Math.sqrt(leftMagnitude * rightMagnitude);
}

function tokenize(value: string): string[] {
  return value.match(/[\p{Script=Han}]|[\p{L}\p{N}_-]+/gu) ?? [];
}

function validateScope(tenantId: string, policyVersionId: string): void {
  if (!isUuid(tenantId) || !isUuid(policyVersionId)) {
    throw new RetrievalValidationError(
      'invalid_uuid',
      'tenantId and policyVersionId must be UUIDs',
    );
  }
}

function validateLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new RetrievalValidationError(
      'invalid_limit',
      'candidate limit must be an integer between 1 and 200',
    );
  }
}

function validateEmbedding(
  embedding: readonly number[],
  field: string,
): void {
  if (
    embedding.length !== EMBEDDING_DIMENSIONS ||
    embedding.some((value) => !Number.isFinite(value))
  ) {
    throw new RetrievalValidationError(
      'invalid_embedding',
      `${field} must contain ${EMBEDDING_DIMENSIONS} finite numeric values`,
    );
  }
}

function compareCandidates(
  left: RetrievalCandidate,
  right: RetrievalCandidate,
): number {
  return (
    right.score - left.score ||
    compareText(left.document_id, right.document_id) ||
    left.chunk_index - right.chunk_index ||
    compareText(left.chunk_id, right.chunk_id)
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

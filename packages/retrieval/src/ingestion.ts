import { createHash } from 'node:crypto';
import type {
  PolicyChunk,
  PolicyDocumentRecord,
  PolicyIngestionPlan,
  PolicySourceDocument,
} from '@opensupport/shared';
import { isUuid } from '@opensupport/shared';
import { RetrievalValidationError } from './errors.js';

export interface CreatePolicyIngestionPlanInput {
  tenantId: string;
  policyVersionId: string;
  documents: readonly PolicySourceDocument[];
  maxChunkChars?: number;
  overlapChars?: number;
}

const DEFAULT_MAX_CHUNK_CHARS = 1200;
const DEFAULT_OVERLAP_CHARS = 120;
const MIN_CHUNK_CHARS = 128;

export function createPolicyIngestionPlan(
  input: CreatePolicyIngestionPlanInput,
): PolicyIngestionPlan {
  validateIdentity(input.tenantId, 'tenantId');
  validateIdentity(input.policyVersionId, 'policyVersionId');

  const maxChunkChars = input.maxChunkChars ?? DEFAULT_MAX_CHUNK_CHARS;
  const overlapChars = input.overlapChars ?? DEFAULT_OVERLAP_CHARS;
  validateChunking(maxChunkChars, overlapChars);

  const sourceDocuments = normalizeAndSortDocuments(input.documents);
  const documents: PolicyDocumentRecord[] = [];
  const chunks: PolicyChunk[] = [];

  for (const source of sourceDocuments) {
    const documentId = deterministicUuid(
      `policy-document:${input.tenantId}:${input.policyVersionId}:${source.source_key}`,
    );
    const contentHash = sha256(source.content);
    const document: PolicyDocumentRecord = {
      id: documentId,
      tenant_id: input.tenantId,
      policy_version_id: input.policyVersionId,
      source_key: source.source_key,
      title: source.title,
      media_type: source.media_type,
      normalized_content: source.content,
      content_hash: contentHash,
      metadata: source.metadata,
    };
    documents.push(document);

    const slices = chunkContent(source.content, maxChunkChars, overlapChars);
    for (const [chunkIndex, slice] of slices.entries()) {
      const chunkHash = sha256(slice.content);
      chunks.push({
        id: deterministicUuid(
          `policy-chunk:${documentId}:${chunkIndex}:${chunkHash}`,
        ),
        tenant_id: input.tenantId,
        policy_version_id: input.policyVersionId,
        document_id: documentId,
        chunk_index: chunkIndex,
        char_start: slice.start,
        char_end: slice.end,
        content: slice.content,
        content_hash: chunkHash,
        token_count: countTokens(slice.content),
      });
    }
  }

  return {
    tenant_id: input.tenantId,
    policy_version_id: input.policyVersionId,
    content_hash: sha256(
      documents
        .map((document) =>
          stableJson({
            source_key: document.source_key,
            title: document.title,
            media_type: document.media_type,
            content_hash: document.content_hash,
            metadata: document.metadata,
          }),
        )
        .join('\n'),
    ),
    documents,
    chunks,
  };
}

export function normalizePolicyContent(content: string): string {
  return content
    .normalize('NFKC')
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/gu, ''))
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function normalizeAndSortDocuments(
  documents: readonly PolicySourceDocument[],
): NormalizedSourceDocument[] {
  if (documents.length === 0) {
    throw new RetrievalValidationError(
      'invalid_document',
      'at least one policy document is required',
    );
  }

  const bySource = new Map<string, NormalizedSourceDocument>();
  for (const document of documents) {
    const sourceKey = document.source_key.trim();
    const title = document.title.trim();
    const mediaType = document.media_type.trim().toLowerCase();
    const content = normalizePolicyContent(document.content);
    if (
      sourceKey.length === 0 ||
      title.length === 0 ||
      mediaType.length === 0 ||
      content.length === 0
    ) {
      throw new RetrievalValidationError(
        'invalid_document',
        'source_key, title, media_type, and content are required',
      );
    }

    const normalized: NormalizedSourceDocument = {
      source_key: sourceKey,
      title,
      media_type: mediaType,
      content,
      metadata: Object.freeze({ ...document.metadata }),
    };
    const existing = bySource.get(sourceKey);
    if (existing !== undefined) {
      if (
        existing.title !== normalized.title ||
        existing.media_type !== normalized.media_type ||
        existing.content !== normalized.content ||
        stableJson(existing.metadata) !== stableJson(normalized.metadata)
      ) {
        throw new RetrievalValidationError(
          'duplicate_source',
          `source_key ${sourceKey} has conflicting documents`,
        );
      }
      continue;
    }
    bySource.set(sourceKey, normalized);
  }

  return [...bySource.values()].sort((left, right) =>
    compareText(left.source_key, right.source_key),
  );
}

function chunkContent(
  content: string,
  maxChunkChars: number,
  overlapChars: number,
): ChunkSlice[] {
  const chunks: ChunkSlice[] = [];
  let cursor = 0;

  while (cursor < content.length) {
    let end = Math.min(cursor + maxChunkChars, content.length);
    if (end < content.length) {
      const minimumBoundary = cursor + Math.floor(maxChunkChars * 0.6);
      const boundary = findBoundary(content, minimumBoundary, end);
      if (boundary > cursor) {
        end = boundary;
      }
    }

    const raw = content.slice(cursor, end);
    const leadingWhitespace = raw.length - raw.trimStart().length;
    const trailingWhitespace = raw.length - raw.trimEnd().length;
    const start = cursor + leadingWhitespace;
    const trimmedEnd = end - trailingWhitespace;
    if (trimmedEnd > start) {
      chunks.push({
        start,
        end: trimmedEnd,
        content: content.slice(start, trimmedEnd),
      });
    }

    if (end >= content.length) {
      break;
    }
    cursor = Math.max(end - overlapChars, cursor + 1);
  }

  return chunks;
}

function findBoundary(content: string, minimum: number, maximum: number): number {
  for (let index = maximum; index >= minimum; index -= 1) {
    const value = content[index - 1];
    if (value === '\n') {
      return index;
    }
  }
  for (let index = maximum; index >= minimum; index -= 1) {
    const value = content[index - 1];
    if (value !== undefined && /\s/u.test(value)) {
      return index;
    }
  }
  return maximum;
}

function validateIdentity(value: string, field: string): void {
  if (!isUuid(value)) {
    throw new RetrievalValidationError(
      'invalid_uuid',
      `${field} must be a UUID`,
    );
  }
}

function validateChunking(maxChunkChars: number, overlapChars: number): void {
  if (
    !Number.isInteger(maxChunkChars) ||
    maxChunkChars < MIN_CHUNK_CHARS ||
    !Number.isInteger(overlapChars) ||
    overlapChars < 0 ||
    overlapChars >= maxChunkChars
  ) {
    throw new RetrievalValidationError(
      'invalid_chunking',
      `maxChunkChars must be >= ${MIN_CHUNK_CHARS} and overlapChars must be smaller`,
    );
  }
}

function countTokens(content: string): number {
  return Math.max(1, tokenize(content).length);
}

function tokenize(content: string): string[] {
  return content
    .normalize('NFKC')
    .toLowerCase()
    .match(/[\p{Script=Han}]|[\p{L}\p{N}_-]+/gu) ?? [];
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function deterministicUuid(value: string): string {
  const bytes = createHash('sha256').update(value, 'utf8').digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

function stableJson(value: Readonly<Record<string, unknown>>): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareText(left, right))
        .map(([key, nestedValue]) => [key, canonicalize(nestedValue)]),
    );
  }
  return value;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

interface NormalizedSourceDocument {
  source_key: string;
  title: string;
  media_type: string;
  content: string;
  metadata: Readonly<Record<string, unknown>>;
}

interface ChunkSlice {
  start: number;
  end: number;
  content: string;
}

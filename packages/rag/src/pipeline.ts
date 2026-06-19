import { createHash } from 'node:crypto';
import type {
  EvidenceBundle,
  EvidenceGateReasonCode,
  EvidenceRef,
  MergedRetrievalCandidate,
  RAGPipelineConfig,
  RetrievalCandidate,
} from '@opensupport/shared';
import { isUuid } from '@opensupport/shared';
import { RAGValidationError } from './errors.js';
import type {
  RAGPipelineAdapters,
  RunRAGPipelineInput,
} from './types.js';

const INJECTION_PATTERNS = [
  /\bignore\s+(?:all\s+)?(?:previous|prior)\s+instructions?\b/iu,
  /\breveal\s+(?:the\s+)?system\s+prompt\b/iu,
  /\b(?:call|invoke|execute)\s+(?:a\s+)?tool\b/iu,
  /\bdeveloper\s+message\b/iu,
  /忽略(?:之前|以上)(?:所有)?指令|系统提示词|调用工具/iu,
] as const;

export async function runRAGEvidencePipeline(
  input: RunRAGPipelineInput,
  adapters: RAGPipelineAdapters,
): Promise<EvidenceBundle> {
  validateInput(input);
  const normalizedQuery = normalizeQuery(input.query, input.config.max_query_chars);
  const rewrittenQuery = await rewriteQuery(
    normalizedQuery,
    input.config,
    adapters,
  );
  const request = {
    tenant_id: input.tenantId,
    policy_version_id: input.policyVersionId,
    query: rewrittenQuery,
  };
  const [rawLexical, rawVector] = await Promise.all([
    adapters.retrieveLexical({
      ...request,
      limit: input.config.lexical_limit,
    }),
    adapters.retrieveVector({
      ...request,
      limit: input.config.vector_limit,
    }),
  ]);
  const lexical = [...rawLexical];
  const vector = [...rawVector];
  const staleVersion = [...lexical, ...vector].some(
    (candidate) =>
      candidate.tenant_id !== input.tenantId ||
      candidate.policy_version_id !== input.policyVersionId,
  );
  const scopedLexical = scopeCandidates(
    lexical,
    input.tenantId,
    input.policyVersionId,
  );
  const scopedVector = scopeCandidates(
    vector,
    input.tenantId,
    input.policyVersionId,
  );
  const mergedCandidates = mergeAndRerank(
    normalizedQuery,
    scopedLexical,
    scopedVector,
    input.config,
  );
  const evidence = mergedCandidates
    .filter(
      (candidate) =>
        candidate.threshold_passed && !candidate.injection_detected,
    )
    .slice(0, input.config.top_k)
    .map((candidate) =>
      toEvidenceRef(
        candidate,
        input.config.id,
        input.config.max_query_chars,
      ),
    );
  const reasonCodes = gateReasons(
    staleVersion,
    mergedCandidates,
    evidence,
  );
  const blocking = reasonCodes.some(
    (reason) => reason !== 'evidence_valid',
  );

  return {
    tenant_id: input.tenantId,
    policy_version_id: input.policyVersionId,
    retrieval_config_version_id: input.config.id,
    normalized_query: normalizedQuery,
    rewritten_query: rewrittenQuery,
    raw_lexical_candidates: lexical,
    raw_vector_candidates: vector,
    merged_candidates: mergedCandidates,
    evidence,
    gate: {
      decision: blocking ? 'block' : 'allow',
      reason_codes: reasonCodes,
      blocking,
      threshold: input.config.score_threshold,
      valid_evidence_ids: evidence.map((item) => item.evidence_id),
    },
  };
}

function mergeAndRerank(
  query: string,
  lexical: readonly RetrievalCandidate[],
  vector: readonly RetrievalCandidate[],
  config: RAGPipelineConfig,
): MergedRetrievalCandidate[] {
  const merged = new Map<string, MutableMergedCandidate>();
  mergeSource(merged, lexical, 'lexical');
  mergeSource(merged, vector, 'vector');
  const queryTokens = new Set(tokenize(query));

  return [...merged.values()]
    .map((candidate) => {
      const lexicalScore = candidate.lexical_score ?? 0;
      const vectorScore = candidate.vector_score ?? 0;
      const mergedScore = clampScore(
        lexicalScore * config.lexical_weight +
          vectorScore * config.vector_weight,
      );
      const contentTokens = new Set(tokenize(candidate.content));
      const matching = [...queryTokens].filter((token) =>
        contentTokens.has(token),
      ).length;
      const queryCoverage =
        queryTokens.size === 0 ? 0 : matching / queryTokens.size;
      const rerankScore = clampScore(mergedScore * 0.8 + queryCoverage * 0.2);

      return {
        ...candidate,
        merged_score: mergedScore,
        rerank_score: rerankScore,
        threshold_passed: rerankScore >= config.score_threshold,
        injection_detected: hasDocumentInjection(candidate.content),
      };
    })
    .sort(compareMergedCandidates);
}

function mergeSource(
  merged: Map<string, MutableMergedCandidate>,
  candidates: readonly RetrievalCandidate[],
  source: 'lexical' | 'vector',
): void {
  for (const candidate of candidates) {
    const existing = merged.get(candidate.chunk_id);
    if (existing !== undefined) {
      if (
        existing.content_hash !== candidate.content_hash ||
        existing.content !== candidate.content ||
        existing.document_id !== candidate.document_id
      ) {
        throw new RAGValidationError(
          'invalid_scope',
          `candidate ${candidate.chunk_id} has inconsistent source records`,
        );
      }
      if (source === 'lexical') {
        existing.lexical_score = Math.max(
          existing.lexical_score ?? 0,
          candidate.score,
        );
      } else {
        existing.vector_score = Math.max(
          existing.vector_score ?? 0,
          candidate.score,
        );
      }
      continue;
    }

    merged.set(candidate.chunk_id, {
      tenant_id: candidate.tenant_id,
      policy_version_id: candidate.policy_version_id,
      document_id: candidate.document_id,
      chunk_id: candidate.chunk_id,
      chunk_index: candidate.chunk_index,
      content: candidate.content,
      content_hash: candidate.content_hash,
      lexical_score: source === 'lexical' ? candidate.score : null,
      vector_score: source === 'vector' ? candidate.score : null,
    });
  }
}

function gateReasons(
  staleVersion: boolean,
  candidates: readonly MergedRetrievalCandidate[],
  evidence: readonly EvidenceRef[],
): EvidenceGateReasonCode[] {
  const reasons: EvidenceGateReasonCode[] = [];
  if (staleVersion) {
    reasons.push('stale_version');
  }
  if (
    candidates.some(
      (candidate) =>
        candidate.threshold_passed && candidate.injection_detected,
    )
  ) {
    reasons.push('injected_document');
  }
  if (hasConflictingPolicy(evidence)) {
    reasons.push('conflict_detected');
  }
  if (evidence.length === 0) {
    reasons.push('no_evidence');
  }
  return reasons.length === 0 ? ['evidence_valid'] : reasons;
}

function hasConflictingPolicy(evidence: readonly EvidenceRef[]): boolean {
  const claims = new Map<string, Set<string>>();
  for (const item of evidence) {
    for (const claim of extractPolicyClaims(item.excerpt)) {
      const values = claims.get(claim.key) ?? new Set<string>();
      values.add(claim.value);
      claims.set(claim.key, values);
    }
  }
  return [...claims.values()].some((values) => values.size > 1);
}

function extractPolicyClaims(content: string): PolicyClaim[] {
  const normalized = content.normalize('NFKC').toLowerCase();
  const claims: PolicyClaim[] = [];
  const returnWindow = normalized.match(
    /(?:return|refund|退货|退款)[^\d]{0,40}(\d{1,3})\s*(?:days?|天)/iu,
  );
  if (returnWindow?.[1] !== undefined) {
    claims.push({ key: 'return_window_days', value: returnWindow[1] });
  }
  if (/(?:refund|退款)/iu.test(normalized)) {
    if (/\b(?:not|never)\s+(?:eligible|allowed|refundable)\b|不可退款|不允许退款/iu.test(normalized)) {
      claims.push({ key: 'refund_allowed', value: 'false' });
    } else if (/\b(?:eligible|allowed|refundable)\b|可以退款|允许退款/iu.test(normalized)) {
      claims.push({ key: 'refund_allowed', value: 'true' });
    }
  }
  return claims;
}

function toEvidenceRef(
  candidate: MergedRetrievalCandidate,
  retrievalConfigVersionId: string,
  excerptLimit: number,
): EvidenceRef {
  const evidenceId = `evidence:${createHash('sha256')
    .update(
      [
        candidate.tenant_id,
        candidate.policy_version_id,
        retrievalConfigVersionId,
        candidate.chunk_id,
        candidate.content_hash,
      ].join(':'),
      'utf8',
    )
    .digest('hex')
    .slice(0, 32)}`;
  return {
    evidence_id: evidenceId,
    tenant_id: candidate.tenant_id,
    policy_version_id: candidate.policy_version_id,
    retrieval_config_version_id: retrievalConfigVersionId,
    document_id: candidate.document_id,
    chunk_id: candidate.chunk_id,
    content_hash: candidate.content_hash,
    excerpt:
      candidate.content.length <= excerptLimit
        ? candidate.content
        : candidate.content.slice(0, excerptLimit),
    lexical_score: candidate.lexical_score,
    vector_score: candidate.vector_score,
    merged_score: candidate.merged_score,
    rerank_score: candidate.rerank_score,
  };
}

function validateInput(input: RunRAGPipelineInput): void {
  if (
    !isUuid(input.tenantId) ||
    !isUuid(input.policyVersionId) ||
    input.config.tenant_id !== input.tenantId ||
    !isUuid(input.config.id)
  ) {
    throw new RAGValidationError(
      'invalid_scope',
      'tenant, policy, and retrieval config scope must be consistent UUIDs',
    );
  }
  if (
    input.config.embedding_dimensions !== 1536 ||
    input.config.lexical_weight < 0 ||
    input.config.vector_weight < 0 ||
    Math.abs(
      input.config.lexical_weight + input.config.vector_weight - 1,
    ) > Number.EPSILON ||
    input.config.score_threshold < 0 ||
    input.config.score_threshold > 1 ||
    input.config.top_k < 1 ||
    input.config.lexical_limit < 1 ||
    input.config.vector_limit < 1 ||
    input.config.max_query_chars < 32 ||
    input.config.max_query_chars > 4096
  ) {
    throw new RAGValidationError(
      'invalid_config',
      'retrieval config weights, limits, threshold, and dimensions are invalid',
    );
  }
}

function normalizeQuery(query: string, maxQueryChars: number): string {
  const normalized = query
    .normalize('NFKC')
    .replace(/\s+/gu, ' ')
    .trim();
  if (normalized.length === 0 || normalized.length > maxQueryChars) {
    throw new RAGValidationError(
      'invalid_query',
      `query must contain 1 to ${maxQueryChars} characters`,
    );
  }
  return normalized;
}

async function rewriteQuery(
  query: string,
  config: RAGPipelineConfig,
  adapters: RAGPipelineAdapters,
): Promise<string> {
  if (!config.query_rewrite_enabled || adapters.rewriteQuery === undefined) {
    return query;
  }
  const rewritten = normalizeQuery(
    await adapters.rewriteQuery(query),
    config.max_query_chars,
  );
  if (rewritten.length > query.length * 3) {
    throw new RAGValidationError(
      'invalid_rewrite',
      'rewritten query exceeds the bounded expansion ratio',
    );
  }
  return rewritten;
}

function scopeCandidates(
  candidates: readonly RetrievalCandidate[],
  tenantId: string,
  policyVersionId: string,
): RetrievalCandidate[] {
  return candidates.filter(
    (candidate) =>
      candidate.tenant_id === tenantId &&
      candidate.policy_version_id === policyVersionId,
  );
}

function hasDocumentInjection(content: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(content));
}

function tokenize(value: string): string[] {
  return (
    value
      .normalize('NFKC')
      .toLowerCase()
      .match(/[\p{Script=Han}]|[\p{L}\p{N}_-]+/gu) ?? []
  );
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(1, score));
}

function compareMergedCandidates(
  left: MergedRetrievalCandidate,
  right: MergedRetrievalCandidate,
): number {
  return (
    right.rerank_score - left.rerank_score ||
    compareText(left.document_id, right.document_id) ||
    left.chunk_index - right.chunk_index ||
    compareText(left.chunk_id, right.chunk_id)
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

interface MutableMergedCandidate {
  tenant_id: string;
  policy_version_id: string;
  document_id: string;
  chunk_id: string;
  chunk_index: number;
  content: string;
  content_hash: string;
  lexical_score: number | null;
  vector_score: number | null;
}

interface PolicyClaim {
  key: string;
  value: string;
}

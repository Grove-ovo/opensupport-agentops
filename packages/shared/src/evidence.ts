import type {
  RetrievalCandidate,
  RetrievalConfigVersion,
} from './retrieval.js';

export type EvidenceGateReasonCode =
  | 'evidence_valid'
  | 'no_evidence'
  | 'stale_version'
  | 'injected_document'
  | 'conflict_detected';

export interface MergedRetrievalCandidate {
  tenant_id: string;
  policy_version_id: string;
  document_id: string;
  chunk_id: string;
  chunk_index: number;
  content: string;
  content_hash: string;
  lexical_score: number | null;
  vector_score: number | null;
  merged_score: number;
  rerank_score: number;
  threshold_passed: boolean;
  injection_detected: boolean;
}

export interface EvidenceRef {
  evidence_id: string;
  tenant_id: string;
  policy_version_id: string;
  retrieval_config_version_id: string;
  document_id: string;
  chunk_id: string;
  content_hash: string;
  excerpt: string;
  lexical_score: number | null;
  vector_score: number | null;
  merged_score: number;
  rerank_score: number;
}

export interface EvidenceGateDecision {
  decision: 'allow' | 'block';
  reason_codes: EvidenceGateReasonCode[];
  blocking: boolean;
  threshold: number;
  valid_evidence_ids: string[];
}

export interface EvidenceBundle {
  tenant_id: string;
  policy_version_id: string;
  retrieval_config_version_id: string;
  normalized_query: string;
  rewritten_query: string;
  raw_lexical_candidates: RetrievalCandidate[];
  raw_vector_candidates: RetrievalCandidate[];
  merged_candidates: MergedRetrievalCandidate[];
  evidence: EvidenceRef[];
  gate: EvidenceGateDecision;
}

export interface RAGBaselineCase {
  case_id: string;
  expected_evidence_ids: string[];
  returned_evidence_ids: string[];
}

export interface RAGBaselineMetrics {
  case_count: number;
  expected_evidence_count: number;
  recall_at_5: number;
  evidence_hit_rate: number;
}

export interface RAGPipelineConfig extends RetrievalConfigVersion {
  query_rewrite_enabled: boolean;
  max_query_chars: number;
}

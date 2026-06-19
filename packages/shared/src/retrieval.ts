export type PolicyVersionStatus = 'draft' | 'published' | 'archived';

export interface PolicySourceDocument {
  source_key: string;
  title: string;
  media_type: string;
  content: string;
  metadata: Readonly<Record<string, unknown>>;
}

export interface PolicyDocumentRecord {
  id: string;
  tenant_id: string;
  policy_version_id: string;
  source_key: string;
  title: string;
  media_type: string;
  normalized_content: string;
  content_hash: string;
  metadata: Readonly<Record<string, unknown>>;
}

export interface PolicyChunk {
  id: string;
  tenant_id: string;
  policy_version_id: string;
  document_id: string;
  chunk_index: number;
  char_start: number;
  char_end: number;
  content: string;
  content_hash: string;
  token_count: number;
}

export interface PolicyIngestionPlan {
  tenant_id: string;
  policy_version_id: string;
  content_hash: string;
  documents: PolicyDocumentRecord[];
  chunks: PolicyChunk[];
}

export interface RetrievalChunkRecord extends PolicyChunk {
  embedding: readonly number[] | null;
}

export type RetrievalCandidateSource = 'lexical' | 'vector';

export interface RetrievalCandidate {
  tenant_id: string;
  policy_version_id: string;
  document_id: string;
  chunk_id: string;
  chunk_index: number;
  content: string;
  content_hash: string;
  source: RetrievalCandidateSource;
  score: number;
}

export interface RetrievalConfigVersion {
  id: string;
  tenant_id: string;
  version: number;
  lexical_weight: number;
  vector_weight: number;
  lexical_limit: number;
  vector_limit: number;
  top_k: number;
  score_threshold: number;
  embedding_model: string;
  embedding_dimensions: 1536;
  is_active: boolean;
  config_hash: string;
}

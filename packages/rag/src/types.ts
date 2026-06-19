import type {
  RAGPipelineConfig,
  RetrievalCandidate,
} from '@opensupport/shared';

export interface CandidateRetrievalRequest {
  tenant_id: string;
  policy_version_id: string;
  query: string;
  limit: number;
}

export interface RAGPipelineAdapters {
  retrieveLexical(
    request: CandidateRetrievalRequest,
  ): Promise<readonly RetrievalCandidate[]> | readonly RetrievalCandidate[];
  retrieveVector(
    request: CandidateRetrievalRequest,
  ): Promise<readonly RetrievalCandidate[]> | readonly RetrievalCandidate[];
  rewriteQuery?(
    query: string,
  ): Promise<string> | string;
}

export interface RunRAGPipelineInput {
  tenantId: string;
  policyVersionId: string;
  query: string;
  config: RAGPipelineConfig;
}

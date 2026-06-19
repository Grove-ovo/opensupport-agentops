export { evaluateRAGBaseline } from './eval.js';
export { RAGValidationError } from './errors.js';
export { runRAGEvidencePipeline } from './pipeline.js';
export type {
  CandidateRetrievalRequest,
  RAGPipelineAdapters,
  RunRAGPipelineInput,
} from './types.js';
export type {
  EvidenceBundle,
  EvidenceGateDecision,
  EvidenceGateReasonCode,
  EvidenceRef,
  MergedRetrievalCandidate,
  RAGBaselineCase,
  RAGBaselineMetrics,
  RAGPipelineConfig,
} from '@opensupport/shared';

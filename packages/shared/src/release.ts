import type { TraceVersionSnapshot } from './trace.js';

export type ReleaseCandidateState =
  | 'draft'
  | 'evaluating'
  | 'failed'
  | 'shadow'
  | 'assist'
  | 'auto'
  | 'archived';

export type ReleaseCandidateActorType = 'system' | 'operator' | 'scheduler';

export type ReleaseCandidateReasonCode =
  | 'evaluation_started'
  | 'evaluation_failed'
  | 'promoted_shadow'
  | 'promoted_assist'
  | 'promoted_auto'
  | 'candidate_archived';

export interface ReleaseCandidateSnapshot extends TraceVersionSnapshot {
  candidate_id: string;
  tenant_id: string;
  replay_eval_run_id: string;
  security_eval_run_id: string;
  config_snapshot_hash: string;
  snapshot_hash: string;
  created_at: string;
}

export interface ReleaseCandidate {
  snapshot: ReleaseCandidateSnapshot;
  state: ReleaseCandidateState;
  updated_at: string;
}

export interface ReleaseCandidateTransition {
  transition_id: string;
  candidate_id: string;
  tenant_id: string;
  from_state: ReleaseCandidateState;
  to_state: ReleaseCandidateState;
  reason_code: ReleaseCandidateReasonCode;
  actor_type: ReleaseCandidateActorType;
  actor_id: string | null;
  idempotency_key: string;
  input_hash: string;
  created_at: string;
}

export interface ReleaseCandidateTransitionCommand {
  candidate_id: string;
  tenant_id: string;
  expected_state: ReleaseCandidateState;
  next_state: ReleaseCandidateState;
  reason_code: ReleaseCandidateReasonCode;
  actor_type: ReleaseCandidateActorType;
  actor_id: string | null;
  idempotency_key: string;
  occurred_at?: string;
}

export interface ReleaseCandidateTransitionResult {
  status: 'applied' | 'duplicate';
  candidate: ReleaseCandidate;
  transition: ReleaseCandidateTransition;
}

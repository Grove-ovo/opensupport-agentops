import { createHash } from 'node:crypto';
import {
  isUuid,
  type EvalRun,
  type ReleaseCandidate,
  type ReleaseCandidateReasonCode,
  type ReleaseCandidateSnapshot,
  type ReleaseCandidateState,
  type ReleaseCandidateTransition,
  type ReleaseCandidateTransitionCommand,
  type ReleaseCandidateTransitionResult,
  type ReplayEvalMetrics,
  type SecurityEvalMetrics,
  type TraceVersionSnapshot,
} from '@opensupport/shared';

export interface CreateReleaseCandidateCommand extends TraceVersionSnapshot {
  candidate_id: string;
  tenant_id: string;
  replay_eval_run_id: string;
  security_eval_run_id: string;
  created_at?: string;
}

export type ReleaseCandidateErrorCode =
  | 'invalid_command'
  | 'candidate_not_found'
  | 'cross_scope'
  | 'eval_scope_mismatch'
  | 'stale_state'
  | 'terminal_state'
  | 'invalid_transition'
  | 'idempotency_conflict';

export class ReleaseCandidateError extends Error {
  constructor(
    readonly code: ReleaseCandidateErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ReleaseCandidateError';
  }
}

const VERSION_FIELDS = [
  'agent_version_id',
  'prompt_version_id',
  'policy_version_id',
  'tool_manifest_version_id',
  'risk_rule_version_id',
  'retrieval_config_version_id',
  'model_config_version_id',
] as const satisfies readonly (keyof TraceVersionSnapshot)[];

function reasons(
  ...values: ReleaseCandidateReasonCode[]
): readonly ReleaseCandidateReasonCode[] {
  return Object.freeze(values);
}

const TRANSITION_RULES: Readonly<
  Record<
    ReleaseCandidateState,
    Readonly<
      Partial<
        Record<ReleaseCandidateState, readonly ReleaseCandidateReasonCode[]>
      >
    >
  >
> = Object.freeze({
  draft: Object.freeze({
    evaluating: reasons('evaluation_started'),
  }),
  evaluating: Object.freeze({
    failed: reasons('evaluation_failed'),
    shadow: reasons('promoted_shadow'),
    assist: reasons('promoted_assist'),
    auto: reasons('promoted_auto'),
  }),
  failed: Object.freeze({
    archived: reasons('candidate_archived'),
  }),
  shadow: Object.freeze({
    archived: reasons('candidate_archived'),
  }),
  assist: Object.freeze({
    archived: reasons('candidate_archived'),
  }),
  auto: Object.freeze({
    archived: reasons('candidate_archived'),
  }),
  archived: Object.freeze({}),
});

const STATES = new Set<ReleaseCandidateState>(
  Object.keys(TRANSITION_RULES) as ReleaseCandidateState[],
);
const REASONS = new Set<ReleaseCandidateReasonCode>(
  Object.values(TRANSITION_RULES).flatMap((targets) =>
    Object.values(targets).flat(),
  ),
);
const ACTORS = new Set<ReleaseCandidateTransitionCommand['actor_type']>([
  'system',
  'operator',
  'scheduler',
]);

export function createReleaseCandidate(
  command: CreateReleaseCandidateCommand,
  replayRun: EvalRun<ReplayEvalMetrics>,
  securityRun: EvalRun<SecurityEvalMetrics>,
  now: Date | string = new Date(),
): ReleaseCandidate {
  validateCreateCommand(command);
  const createdAt = normalizeTimestamp(command.created_at ?? now);
  const versionSnapshot = versionValues(command);
  const configSnapshotHash = hashJson(versionSnapshot);
  validateEvalRun(
    replayRun,
    command.tenant_id,
    command.replay_eval_run_id,
    'replay',
    configSnapshotHash,
  );
  validateEvalRun(
    securityRun,
    command.tenant_id,
    command.security_eval_run_id,
    'security',
    configSnapshotHash,
  );
  const snapshot: ReleaseCandidateSnapshot = Object.freeze({
    candidate_id: command.candidate_id,
    tenant_id: command.tenant_id,
    ...versionSnapshot,
    replay_eval_run_id: command.replay_eval_run_id,
    security_eval_run_id: command.security_eval_run_id,
    config_snapshot_hash: configSnapshotHash,
    snapshot_hash: hashJson({
      candidate_id: command.candidate_id,
      tenant_id: command.tenant_id,
      ...versionSnapshot,
      replay_eval_run_id: command.replay_eval_run_id,
      security_eval_run_id: command.security_eval_run_id,
    }),
    created_at: createdAt,
  });
  return Object.freeze({
    snapshot,
    state: 'draft',
    updated_at: createdAt,
  });
}

export function applyReleaseCandidateTransition(
  candidate: ReleaseCandidate,
  command: ReleaseCandidateTransitionCommand,
  existingTransition?: ReleaseCandidateTransition,
  now: Date | string = new Date(),
): ReleaseCandidateTransitionResult {
  const normalized = normalizeTransitionCommand(command, now);
  validateCandidateScope(candidate, normalized);
  const inputHash = hashTransitionInput(normalized);
  if (existingTransition !== undefined) {
    if (
      existingTransition.candidate_id !== normalized.candidate_id ||
      existingTransition.tenant_id !== normalized.tenant_id ||
      existingTransition.idempotency_key !== normalized.idempotency_key ||
      existingTransition.input_hash !== inputHash
    ) {
      throw new ReleaseCandidateError(
        'idempotency_conflict',
        'release candidate transition key was reused with different input',
      );
    }
    return {
      status: 'duplicate',
      candidate,
      transition: existingTransition,
    };
  }
  if (candidate.state !== normalized.expected_state) {
    throw new ReleaseCandidateError(
      'stale_state',
      `expected ${normalized.expected_state} but found ${candidate.state}`,
    );
  }
  const allowed = TRANSITION_RULES[candidate.state];
  if (Object.keys(allowed).length === 0) {
    throw new ReleaseCandidateError(
      'terminal_state',
      `${candidate.state} is terminal`,
    );
  }
  if (
    normalized.expected_state === normalized.next_state ||
    !(allowed[normalized.next_state] ?? []).includes(normalized.reason_code)
  ) {
    throw new ReleaseCandidateError(
      'invalid_transition',
      `${normalized.expected_state} cannot transition to ${normalized.next_state} with ${normalized.reason_code}`,
    );
  }
  const transition: ReleaseCandidateTransition = Object.freeze({
    transition_id: deterministicUuid(
      `${normalized.tenant_id}:${normalized.candidate_id}:${normalized.idempotency_key}`,
    ),
    candidate_id: normalized.candidate_id,
    tenant_id: normalized.tenant_id,
    from_state: normalized.expected_state,
    to_state: normalized.next_state,
    reason_code: normalized.reason_code,
    actor_type: normalized.actor_type,
    actor_id: normalized.actor_id,
    idempotency_key: normalized.idempotency_key,
    input_hash: inputHash,
    created_at: normalized.occurred_at,
  });
  return {
    status: 'applied',
    candidate: Object.freeze({
      snapshot: candidate.snapshot,
      state: normalized.next_state,
      updated_at: normalized.occurred_at,
    }),
    transition,
  };
}

export class MemoryReleaseCandidateStateMachine {
  readonly #candidates = new Map<string, ReleaseCandidate>();
  readonly #transitions = new Map<string, ReleaseCandidateTransition>();

  seed(candidate: ReleaseCandidate): void {
    validateCandidate(candidate);
    this.#candidates.set(candidate.snapshot.candidate_id, candidate);
  }

  transition(
    command: ReleaseCandidateTransitionCommand,
    now?: Date | string,
  ): ReleaseCandidateTransitionResult {
    const candidate = this.#candidates.get(command.candidate_id);
    if (candidate === undefined) {
      throw new ReleaseCandidateError(
        'candidate_not_found',
        'release candidate was not found',
      );
    }
    const key = `${command.tenant_id}:${command.candidate_id}:${command.idempotency_key}`;
    const result = applyReleaseCandidateTransition(
      candidate,
      command,
      this.#transitions.get(key),
      now,
    );
    if (result.status === 'applied') {
      this.#candidates.set(command.candidate_id, result.candidate);
      this.#transitions.set(key, result.transition);
    }
    return result;
  }

  get(candidateId: string): ReleaseCandidate | undefined {
    return this.#candidates.get(candidateId);
  }
}

function validateCreateCommand(command: CreateReleaseCandidateCommand): void {
  if (
    !isUuid(command.candidate_id) ||
    !isUuid(command.tenant_id) ||
    !isUuid(command.replay_eval_run_id) ||
    !isUuid(command.security_eval_run_id) ||
    command.replay_eval_run_id === command.security_eval_run_id ||
    VERSION_FIELDS.some(
      (field) => !/^[A-Za-z0-9._:-]{1,128}$/u.test(command[field]),
    )
  ) {
    throw new ReleaseCandidateError(
      'invalid_command',
      'release candidate command is invalid',
    );
  }
}

function validateEvalRun(
  run: EvalRun,
  tenantId: string,
  runId: string,
  runType: EvalRun['run_type'],
  configSnapshotHash: string,
): void {
  if (
    run.run_id !== runId ||
    run.tenant_id !== tenantId ||
    run.run_type !== runType ||
    run.status !== 'succeeded' ||
    run.candidate_snapshot_hash !== configSnapshotHash
  ) {
    throw new ReleaseCandidateError(
      'eval_scope_mismatch',
      `${runType} evaluation does not match the release candidate`,
    );
  }
}

function validateCandidate(candidate: ReleaseCandidate): void {
  if (
    !isUuid(candidate.snapshot.candidate_id) ||
    !isUuid(candidate.snapshot.tenant_id) ||
    !STATES.has(candidate.state) ||
    candidate.snapshot.config_snapshot_hash !==
      hashJson(versionValues(candidate.snapshot)) ||
    candidate.snapshot.snapshot_hash !==
      hashJson({
        candidate_id: candidate.snapshot.candidate_id,
        tenant_id: candidate.snapshot.tenant_id,
        ...versionValues(candidate.snapshot),
        replay_eval_run_id: candidate.snapshot.replay_eval_run_id,
        security_eval_run_id: candidate.snapshot.security_eval_run_id,
      })
  ) {
    throw new ReleaseCandidateError(
      'invalid_command',
      'release candidate snapshot is invalid',
    );
  }
}

function validateCandidateScope(
  candidate: ReleaseCandidate,
  command: ReleaseCandidateTransitionCommand,
): void {
  validateCandidate(candidate);
  if (
    candidate.snapshot.candidate_id !== command.candidate_id ||
    candidate.snapshot.tenant_id !== command.tenant_id
  ) {
    throw new ReleaseCandidateError(
      'cross_scope',
      'transition does not match the release candidate scope',
    );
  }
}

function normalizeTransitionCommand(
  command: ReleaseCandidateTransitionCommand,
  now: Date | string,
): ReleaseCandidateTransitionCommand & { occurred_at: string } {
  if (
    !isUuid(command.candidate_id) ||
    !isUuid(command.tenant_id) ||
    !STATES.has(command.expected_state) ||
    !STATES.has(command.next_state) ||
    !REASONS.has(command.reason_code) ||
    !ACTORS.has(command.actor_type) ||
    !/^[A-Za-z0-9._:-]{1,256}$/u.test(command.idempotency_key) ||
    (command.actor_type === 'operator' && command.actor_id === null) ||
    (command.actor_id !== null &&
      (command.actor_id.trim().length === 0 ||
        command.actor_id.trim().length > 256))
  ) {
    throw new ReleaseCandidateError(
      'invalid_command',
      'release candidate transition command is invalid',
    );
  }
  return {
    ...command,
    actor_id: command.actor_id?.trim() ?? null,
    idempotency_key: command.idempotency_key.trim(),
    occurred_at: normalizeTimestamp(command.occurred_at ?? now),
  };
}

function versionValues(
  snapshot: TraceVersionSnapshot,
): TraceVersionSnapshot {
  return Object.freeze(
    Object.fromEntries(
      VERSION_FIELDS.map((field) => [field, snapshot[field]]),
    ) as unknown as TraceVersionSnapshot,
  );
}

function hashTransitionInput(
  command: ReleaseCandidateTransitionCommand,
): string {
  return hashJson({
    candidate_id: command.candidate_id,
    tenant_id: command.tenant_id,
    expected_state: command.expected_state,
    next_state: command.next_state,
    reason_code: command.reason_code,
    actor_type: command.actor_type,
    actor_id: command.actor_id,
    idempotency_key: command.idempotency_key,
  });
}

function normalizeTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ReleaseCandidateError(
      'invalid_command',
      'release candidate timestamp is invalid',
    );
  }
  return date.toISOString();
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function deterministicUuid(value: string): string {
  const bytes = createHash('sha256').update(value).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

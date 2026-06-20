export type TicketExecutionTransitionErrorCode =
  | 'invalid_command'
  | 'trace_not_found'
  | 'cross_scope'
  | 'stale_state'
  | 'terminal_state'
  | 'invalid_transition'
  | 'idempotency_conflict';

export class TicketExecutionTransitionError extends Error {
  constructor(
    readonly code: TicketExecutionTransitionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TicketExecutionTransitionError';
  }
}

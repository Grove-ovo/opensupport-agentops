import type { TraceValidationIssue } from './types.js';

export class TraceValidationError extends Error {
  readonly issues: readonly TraceValidationIssue[];

  constructor(issues: readonly TraceValidationIssue[]) {
    super('Agent trace validation failed');
    this.name = 'TraceValidationError';
    this.issues = issues;
  }
}

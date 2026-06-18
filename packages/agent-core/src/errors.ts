import type { AgentCoreValidationIssue } from './types.js';

export class AgentCoreValidationError extends Error {
  readonly issues: readonly AgentCoreValidationIssue[];

  constructor(issues: readonly AgentCoreValidationIssue[]) {
    super('Agent pipeline context validation failed');
    this.name = 'AgentCoreValidationError';
    this.issues = issues;
  }
}

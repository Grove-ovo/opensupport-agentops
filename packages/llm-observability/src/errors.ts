import type { LLMObservabilityValidationIssue } from './types.js';

export class LLMObservabilityValidationError extends Error {
  readonly issues: readonly LLMObservabilityValidationIssue[];

  constructor(issues: readonly LLMObservabilityValidationIssue[]) {
    super('LLM observability validation failed');
    this.name = 'LLMObservabilityValidationError';
    this.issues = issues;
  }
}

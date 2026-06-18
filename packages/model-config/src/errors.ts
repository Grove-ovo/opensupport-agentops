import type {
  ModelConfigValidationIssue,
  SecretReferenceErrorCode,
} from './types.js';

export class ModelConfigValidationError extends Error {
  readonly issues: readonly ModelConfigValidationIssue[];

  constructor(issues: readonly ModelConfigValidationIssue[]) {
    super('Tenant model config validation failed');
    this.name = 'ModelConfigValidationError';
    this.issues = issues;
  }
}

export class SecretReferenceError extends Error {
  readonly code: SecretReferenceErrorCode;

  constructor(code: SecretReferenceErrorCode) {
    super(`Secret reference error: ${code}`);
    this.name = 'SecretReferenceError';
    this.code = code;
  }
}

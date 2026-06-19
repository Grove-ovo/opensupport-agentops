export type RAGValidationCode =
  | 'invalid_scope'
  | 'invalid_config'
  | 'invalid_query'
  | 'invalid_rewrite';

export class RAGValidationError extends Error {
  readonly code: RAGValidationCode;

  constructor(code: RAGValidationCode, message: string) {
    super(message);
    this.name = 'RAGValidationError';
    this.code = code;
  }
}

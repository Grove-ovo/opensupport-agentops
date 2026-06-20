export type RetrievalValidationCode =
  | 'invalid_uuid'
  | 'invalid_document'
  | 'duplicate_source'
  | 'invalid_chunking'
  | 'invalid_query'
  | 'invalid_limit'
  | 'invalid_embedding';

export class RetrievalValidationError extends Error {
  readonly code: RetrievalValidationCode;

  constructor(code: RetrievalValidationCode, message: string) {
    super(message);
    this.name = 'RetrievalValidationError';
    this.code = code;
  }
}

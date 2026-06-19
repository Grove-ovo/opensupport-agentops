export class GuardrailValidationError extends Error {
  readonly code:
    | 'invalid_context'
    | 'invalid_model_decision';

  constructor(
    code: GuardrailValidationError['code'],
    message: string,
  ) {
    super(message);
    this.name = 'GuardrailValidationError';
    this.code = code;
  }
}

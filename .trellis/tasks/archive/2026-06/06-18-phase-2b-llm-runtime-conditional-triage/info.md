# Technical Design: Phase 2B

Status: Implemented and verified

- Package: `@opensupport/llm-runtime`
- Fast model plus at most one distinct fallback.
- Budget preflight before credential decryption.
- BYOK plaintext scoped to one invocation and never logged.
- Conditional triage uses PII-masked text and validated structured output.
- Phase 1 LLM logging records every provider attempt.

Verification: 7 runtime tests, static validation, full lint/type-check/tests.

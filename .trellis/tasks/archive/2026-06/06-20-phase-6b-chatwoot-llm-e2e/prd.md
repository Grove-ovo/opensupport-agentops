# Phase 6B: Chatwoot And LLM Provider End-to-End

## Goal

Connect the production API to real Chatwoot traffic and real tenant BYOK LLM
providers while preserving canonical dedupe, PII masking, deadlines, cost
governance, runtime modes, and guarded outbound delivery.

## Requirements

- Add Agent Bot and account webhook API routes.
- Resolve tenant Chatwoot credentials by connection, verify signatures, and
  normalize both sources into canonical inbound events.
- Persist the event before execution and allow exactly one pipeline seed.
- Implement Chatwoot HTTP delivery adapter for replies, private notes,
  assignment, and conversation status.
- Implement real OpenAI-compatible and Anthropic provider adapters behind the
  existing LLM provider interface.
- Resolve and decrypt tenant BYOK keys only for the duration of a provider call.
- Wire PII masking, routing, LLM invocation, guardrails, runtime decision,
  trace/cost logs, approval creation, and Chatwoot delivery.
- Add request deadlines, retries only for safe transient operations, and stable
  provider/integration error mapping.
- Provide a mock-server E2E test that uses real HTTP boundaries and PostgreSQL/
  Redis state without calling public services.
- Provide an opt-in live smoke command that requires explicit credentials.

## Acceptance Criteria

- [x] Duplicate dual-entry Chatwoot messages produce one execution.
- [x] Self-outgoing and non-customer events never run the pipeline.
- [x] Provider requests contain masked input and produce persisted call logs.
- [x] Shadow, Assist, and Auto result in the expected Chatwoot or approval side
      effects.
- [x] Timeouts, budgets, provider errors, and Chatwoot errors degrade safely.
- [x] HTTP mock E2E and all existing deterministic tests pass.

## Out Of Scope

- Real commerce mutations.
- Dashboard implementation.
- Running public live-provider calls in CI.

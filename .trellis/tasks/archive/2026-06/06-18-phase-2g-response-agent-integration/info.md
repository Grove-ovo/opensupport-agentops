# Technical Design

Phase 2G composes the completed Phase 2 boundaries into a proposal-only runtime.

- Code Router and rule-first guardrails are direct dependencies.
- Triage, RAG, tool execution, and response generation are typed adapters.
- Grounding is checked before model invocation.
- Response model routing selects fast/strong and permits one retryable fallback.
- A second output guardrail can downgrade generated text.
- The final output is `ResponseProposal` plus ID-only `PipelineTraceAppend`.
- Delivery and approval flags are literal false and no Chatwoot code is imported.

# Rule-First Risk Guardrail

Status: Phase 2F implemented

## Layered Gates

The guardrail evaluates four ordered layers:

1. input: prompt injection, approval bypass, credential/system prompt requests,
   cross-account access, and direct refund execution intent;
2. retrieval: no evidence, stale versions, injected documents, and conflicts;
3. tool: unsafe execution intent, authorization/permission failures, and
   timeout;
4. output: PII leakage, policy claims without evidence, and approval bypass.

Each finding is an immutable `GateDecision` with tenant, trace, risk rule
version, gate, recommendation, reason code, severity, blocking flag, input
hash, and timestamp.

## Precedence

Decisions sort by severity `P0` through `P3`, then input, retrieval, tool, and
output gate order. The aggregate recommendation uses:

```text
block -> handoff -> clarify -> sanitize -> allow
```

Any blocking P0 prevents downstream success. A model judge may append bounded
decisions but cannot remove or downgrade deterministic rule findings.

## Trace Safety

Decision IDs hash tenant, trace, risk rule version, gate, reason, and inspected
input hash. Decisions never store proposed output, customer text, evidence
content, tool arguments, or business results.

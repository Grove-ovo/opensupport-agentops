# Technical Design

Phase 2F evaluates one immutable, tenant-scoped guardrail input across input,
retrieval, tool, and output layers.

- Deterministic rules execute first and remain authoritative.
- Optional model decisions are scope-validated append-only findings.
- Decision IDs and input hashes make results reproducible without retaining
  sensitive inspected content.
- Severity and gate ordering are fixed; recommendation precedence is block,
  handoff, clarify, sanitize, then allow.
- Any P0 blocking finding prevents downstream success.

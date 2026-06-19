# Technical Design

`ReleaseGateService` consumes completed immutable replay/security runs, emits
one `ReleaseGateDecision` per threshold, derives the promotion ceiling, and
uses the Phase 4D state machine for the authoritative candidate transition.

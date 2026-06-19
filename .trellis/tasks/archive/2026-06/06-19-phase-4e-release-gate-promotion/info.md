# Technical Design

Status: Implemented and verified

`ReleaseGateService` consumes completed immutable replay/security runs, emits
one `ReleaseGateDecision` per threshold, derives the promotion ceiling, and
uses the Phase 4D state machine for the authoritative candidate transition.

All 11 required checks use inclusive source-PRD boundaries. P0 and
zero-tolerance failures force `failed`; grounding/retrieval failures cap at
Shadow; regression, escalation, latency, and cost failures cap at Assist.
Migration `0012` persists decisions and promotion atomically and passed two
consecutive migrations plus live PostgreSQL rollback verification.

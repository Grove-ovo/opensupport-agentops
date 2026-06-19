# Technical Design

Status: Implemented

Phase 3A adds a `runtime-control` package with pure transition guards and a
`0006` migration with append-only transition audit plus PostgreSQL transition
validation. Application and database transition graphs use the same exact
from-state, to-state, and reason semantics. The database entry point locks the
trace before idempotency lookup to serialize concurrent retries.

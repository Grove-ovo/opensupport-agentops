# Technical Design

Status: Implemented and verified

Add a pure transition guard plus migration `0011`. PostgreSQL uses a guarded
function to compare expected state, append transition audit, and update the
candidate atomically.

The candidate freezes all seven version IDs and exact succeeded replay and
security Eval Runs. TypeScript and PostgreSQL both validate tenant, run type,
candidate config hash, expected state, reason, actor, and idempotency. Two
consecutive migrations and live mutation/transition verification pass.

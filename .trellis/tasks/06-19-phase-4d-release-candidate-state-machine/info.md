# Technical Design

Add a pure transition guard plus migration `0011`. PostgreSQL uses a guarded
function to compare expected state, append transition audit, and update the
candidate atomically.

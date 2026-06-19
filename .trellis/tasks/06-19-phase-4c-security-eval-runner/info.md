# Technical Design

`SecurityEvalRunner` reuses the normalized candidate executor but applies
security-specific deterministic assertions after execution. P0 failures and
zero-tolerance violation rates are authoritative.

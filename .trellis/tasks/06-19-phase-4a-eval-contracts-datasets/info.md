# Technical Design

Status: Implemented and verified

Add shared eval contracts and a new `packages/eval` loader. A deterministic
generator produces committed JSONL data. Migration `0010` owns immutable case,
run, and result storage; later tasks add runner behavior.

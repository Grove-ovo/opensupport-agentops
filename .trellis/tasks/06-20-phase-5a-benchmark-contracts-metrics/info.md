# Technical Design

Add benchmark contracts to `@opensupport/shared` and deterministic metric/run
logic to `@opensupport/eval`. The runner consumes injected observations and
never calls delivery, approval, commerce, or providers.

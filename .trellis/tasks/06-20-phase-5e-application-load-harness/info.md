# Technical Design

Use Node `perf_hooks` and a project-owned worker-pool runner. Inject the
workload executor and clock/scheduler where needed for deterministic tests,
while production execution uses monotonic timing and event-loop metrics.

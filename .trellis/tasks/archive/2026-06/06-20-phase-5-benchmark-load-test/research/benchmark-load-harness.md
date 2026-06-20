# Phase 5 Benchmark And Load Harness Research

Date: 2026-06-20

## Repository Constraints

- The project currently exposes TypeScript packages and injected adapters, not
  a production HTTP AgentOps service.
- Phase 4 already provides normalized replay observations, deterministic
  metrics, immutable datasets, and reproducible report generation.
- Live LLM providers and real commerce APIs are intentionally outside the MVP
  test path.
- A benchmark must not compare variants using different datasets, budgets, or
  metric definitions.

## Approaches Considered

### A. In-process TypeScript harness using Node performance APIs

Use project-owned benchmark/load contracts, injected variant executors,
`node:perf_hooks`, controlled concurrency, warmup, and deterministic fixtures.

Pros:

- Reuses the exact Phase 4 observation and metric contracts.
- Measures package-level orchestration without inventing an HTTP surface.
- Requires no new runtime dependency or external service.
- Stable in local and CI environments.

Cons:

- Does not measure network, reverse proxy, container, or Chatwoot overhead.
- Deterministic adapters are reference results, not real provider quality.

Node documents `perf_hooks` as stable and provides high-resolution timers,
histograms, percentiles, event-loop utilization, and event-loop delay
monitoring.

Reference:
https://nodejs.org/api/perf_hooks.html

### B. k6 HTTP load test

k6 provides arrival-rate executors that model a fixed iteration rate
independently from system response time.

Pros:

- Strong fit for production-like HTTP throughput and SLO validation.
- Explicit arrival-rate and virtual-user scenarios.

Cons:

- The repository has no AgentOps HTTP serving surface to target yet.
- Adding a benchmark-only server would test new transport plumbing more than
  the current Agent pipeline.
- Requires an external binary/toolchain in local and CI environments.

Reference:
https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/constant-arrival-rate/

### C. Autocannon HTTP benchmark

Autocannon is a Node HTTP/1.1 benchmarking tool with CLI and programmatic APIs.

Pros:

- Fits the existing Node toolchain.
- Good for HTTP throughput/latency once an API service exists.

Cons:

- Still requires a real HTTP endpoint.
- Focuses on HTTP performance, not architecture-variant quality/cost metrics.

Reference:
https://github.com/mcollina/autocannon

## Recommendation

Use Approach A for Phase 5 MVP:

- one project-owned harness for V0–V3 quality/cost comparison;
- one in-process concurrency runner for throughput, latency percentiles,
  timeout/error rate, and event-loop behavior;
- deterministic committed reports;
- clear report labels that results are reference-fixture/application-level.

Preserve an executor/transport boundary so k6 or Autocannon can be added later
when a real AgentOps HTTP API exists. Do not add a benchmark-only HTTP server.

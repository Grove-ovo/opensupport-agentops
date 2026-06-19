# Agent Guidelines

> Executable contracts for the selective Agent pipeline and its deterministic,
> model, retrieval, tool, risk, and response boundaries.

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Phase 2A Agent Pipeline And Code Router](./phase-2a-agent-pipeline-code-router.md) | PII-safe pipeline context, deterministic routing, conditional-triage signals, and route safety | Active |
| [Phase 2B LLM Runtime And Conditional Triage](./phase-2b-llm-runtime-triage.md) | Tenant BYOK invocation, budget preflight, timeout/fallback, call logging, and conditional triage | Active |
| [Phase 2D RAG Evidence Pipeline](./phase-2d-rag-evidence.md) | Hybrid merge, deterministic rerank, evidence citations, blocking retrieval gates, and baseline metrics | Active |
| [Phase 2E Tool Contracts](./phase-2e-tool-contracts.md) | Versioned manifests, schema/permission/ownership validation, deterministic mock tools, audit hashes, and idempotency | Active |
| [Phase 2F Risk Guardrail](./phase-2f-risk-guardrail.md) | Rule-first input/retrieval/tool/output decisions, deterministic precedence, immutable hashes, and bounded model judgment | Active |
| [Phase 2G Agent Runtime](./phase-2g-agent-runtime.md) | Deadline-bound route/triage/RAG/tool/risk/response orchestration, grounding, model fallback, and trace append | Active |
| [Phase 3F Runtime Orchestration](./phase-3f-runtime-orchestration.md) | Controlled Shadow, Assist, and Auto side effects with complete idempotency and audit references | Active |
| [Phase 4A Eval Contracts And Datasets](./phase-4a-eval-contracts-datasets.md) | Versioned safe replay/security cases, strict JSONL loading, and immutable eval persistence | Active |
| [Phase 4B Replay Eval](./phase-4b-replay-eval.md) | Injected candidate replay with deterministic quality, grounding, latency, cost, and regression metrics | Active |
| [Phase 4C Security Eval](./phase-4c-security-eval.md) | Deterministic P0, forbidden outcome, PII, and unauthorized-access evaluation | Active |
| [Phase 4E Release Gate](./phase-4e-release-gate.md) | Exact PRD thresholds, immutable gate decisions, and controlled promotion ceilings | Active |

## Pre-Development Checklist

Before changing Agent pipeline code:

- Read the guide that owns the pipeline step.
- Read [Phase 2D RAG Evidence Pipeline](./phase-2d-rag-evidence.md) when
  changing evidence merge, rerank, thresholds, citations, or retrieval gates.
- Read [Phase 2E Tool Contracts](./phase-2e-tool-contracts.md) when changing
  manifests, tool execution, mock business services, audit, or idempotency.
- Read [Phase 2F Risk Guardrail](./phase-2f-risk-guardrail.md) when changing
  layered safety rules, gate decisions, severity, or recommendations.
- Read [Phase 2G Agent Runtime](./phase-2g-agent-runtime.md) when changing
  orchestration, response proposals, grounding, model routing, or trace append.
- Read [Phase 3F Runtime Orchestration](./phase-3f-runtime-orchestration.md)
  when composing proposals with runtime decisions, delivery, or approvals.
- Read [Phase 4A Eval Contracts And Datasets](./phase-4a-eval-contracts-datasets.md)
  when changing evaluation schemas, fixtures, loaders, runs, or results.
- Read [Phase 4B Replay Eval](./phase-4b-replay-eval.md) when changing replay
  execution, normalized observations, aggregate metrics, or baselines.
- Read [Phase 4C Security Eval](./phase-4c-security-eval.md) when changing
  adversarial execution, P0 outcomes, or zero-tolerance security metrics.
- Read [Phase 4E Release Gate](./phase-4e-release-gate.md) when changing
  release thresholds, decision severity, promotion ceilings, or gate
  idempotency.
- Preserve tenant, trace, deadline, and immutable version context.
- Keep provider-specific payloads behind adapters.
- Confirm whether a value is transient or safe to persist.
- Keep deterministic steps free of network and database side effects.

## Quality Check

- Run `npm run test:phase2a`.
- Run the owned package tests.
- Run `npm run typecheck`, `npm run lint`, and `npm test`.
- Run active Trellis task validation.

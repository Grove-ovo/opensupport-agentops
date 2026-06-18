# Agent Guidelines

> Executable contracts for the selective Agent pipeline and its deterministic,
> model, retrieval, tool, risk, and response boundaries.

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Phase 2A Agent Pipeline And Code Router](./phase-2a-agent-pipeline-code-router.md) | PII-safe pipeline context, deterministic routing, conditional-triage signals, and route safety | Active |

## Pre-Development Checklist

Before changing Agent pipeline code:

- Read the guide that owns the pipeline step.
- Preserve tenant, trace, deadline, and immutable version context.
- Keep provider-specific payloads behind adapters.
- Confirm whether a value is transient or safe to persist.
- Keep deterministic steps free of network and database side effects.

## Quality Check

- Run `npm run test:phase2a`.
- Run the owned package tests.
- Run `npm run typecheck`, `npm run lint`, and `npm test`.
- Run active Trellis task validation.

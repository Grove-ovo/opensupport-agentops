# Phase 2 Agent Runtime

Status: Phase 2G implemented

## Pipeline

```text
AgentPipelineContext
  -> deterministic Code Router
  -> optional Triage adapter
  -> Input Risk preflight
  -> optional RAG Evidence adapter
  -> deterministic ToolPlan + Retrieval/Tool Risk preflight
  -> Tool executor adapter
  -> pre-output Risk Guardrail
  -> grounded Response generator with one fallback
  -> output Risk Guardrail
  -> ResponseProposal + PipelineTraceAppend
```

The runtime emits proposals only. `delivery_performed` and `approval_created`
are literal `false`; Phase 2 imports no Chatwoot connector and creates no
approval record.

## Grounding

Blocking input skips retrieval, tools, and response generation. Policy/refund
intents require a non-blocking evidence bundle with at least one evidence ID.
Planned tools are gated before execution. Business-state intents require one
successful or duplicate tool result for every planned tool call. Missing
grounding or risk-evaluation failure degrades without a reply proposal.

## Models

Low-risk supported intents use the tenant fast model. Refund requests,
complaint escalation, high-risk triage, and non-blocking elevated gate risk use
the strong model. Each model call is bounded by the smaller of the tenant
timeout and remaining pipeline deadline. A retryable response-generation
failure may attempt the tenant fallback model once. Budget blocks do not retry.

## Trace Boundary

`PipelineTraceAppend` contains route/intent, route confidence, evidence IDs,
maximum evidence rerank score, tool call/result IDs, gate decision IDs,
selected model/fallback, latency, tokens, cost, final recommendation/action,
and failure reason. It never contains customer text, provider payloads,
credentials, policy excerpts, or tool results.

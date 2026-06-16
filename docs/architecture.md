# OpenSupport AgentOps Architecture

Status: Proposed  
Created: 2026-06-16  
Owner: Grove-ovo

## Purpose

OpenSupport AgentOps is a tenant-ready ecommerce after-sales support AgentOps MVP based on Chatwoot. Chatwoot owns the customer conversation surface. AgentOps owns the AI middle layer: tenant model configuration, evidence-gated RAG, typed tools, risk controls, runtime modes, approval workflow, traceability, evals, and release gates.

## MVP Architecture Summary

```text
Chatwoot
  Agent Bot / Account Webhooks / Conversation API / Message API
        |
        v
AgentOps API
  Chatwoot Connector
  Tenant Config
  BYOK Model Governance
  Ticket Normalizer
  Runtime Mode Controller
  Approval Service
  Eval and Release Gate Service
        |
        v
Agent Core
  Code Router
  Optional Triage Agent
  RAG Evidence Pipeline
  Tool Executor
  Risk Guardrail
  Response Agent
  Async Monitor Agent
        |
        v
Business Tool Layer
  MCP-compatible typed tools
  Mock Order / Logistics / Refund Dry-run / Handoff
        |
        v
Storage
  PostgreSQL + pgvector
  Redis
```

## Technology Direction

The MVP uses a TypeScript monorepo:

- `apps/api` for the AgentOps backend service.
- `apps/web` for the dashboard.
- `packages/shared` for schemas and shared constants.
- `packages/chatwoot` for Chatwoot integration.
- `packages/agent-core` for orchestration, router, risk, and response logic.
- `packages/rag` for retrieval and evidence gating.
- `packages/tools` for typed business tool execution.
- `packages/eval` for replay eval, security eval, and release gate helpers.

Storage direction:

- PostgreSQL for tenant configs, tickets, traces, logs, evals, releases, and audit state.
- pgvector plus PostgreSQL full-text search for MVP hybrid retrieval.
- Redis for dedupe TTL, idempotency locks, async job coordination, and rate limiting.

Environment rule:

- Local development and demo run local PostgreSQL with pgvector.
- Staging and production use managed cloud PostgreSQL with pgvector.
- All environments share the same schema and migrations. Runtime selection is
  done through `DATABASE_URL`, not separate database-specific code paths.

## Chatwoot Integration

Agent Bot is the primary online invocation path. Account webhooks are also captured for event audit, dedupe, and synchronization.

Connector responsibilities:

- verify webhook signature when a secret is available
- dedupe delivery by Chatwoot delivery ID or fallback key
- parse Chatwoot events
- fetch conversations
- send public replies
- send private notes
- assign to human
- toggle status
- ignore self-created outgoing messages

Only incoming customer messages enter the AgentOps pipeline.

## Online Pipeline

```text
Chatwoot customer message
  -> agent bot request / account webhook
  -> canonical inbound event
  -> signature verification and delivery dedupe
  -> ticket/message normalization
  -> PII masking
  -> prompt-injection pre-check
  -> code router
  -> optional triage agent
  -> RAG evidence retrieval
  -> typed tool execution
  -> risk guardrail
  -> response generation
  -> runtime mode controller
  -> public reply / private note / approval request / handoff
  -> trace, audit, eval candidate, cost logs
```

## Controlled Launch Architecture

The MVP must be safe to run in Shadow, Assist, and Auto without changing the
core pipeline. Controlled launch depends on five rules:

- Canonical inbound events: every Chatwoot input is normalized and deduped
  before it can trigger pipeline work.
- State machines: ticket execution, approval, and release promotion move only
  through explicit states.
- Immutable version snapshots: every trace and release candidate records the
  exact config versions used.
- Multi-layer gates: input, retrieval, tool, and output checks can block or
  downgrade unsafe work.
- Online/async split: user-facing work stays on a bounded critical path;
  monitoring, eval materialization, and dashboard aggregation run async.

### Canonical Inbound Events

Agent Bot is the primary online invocation path. Account webhooks are the audit
and synchronization stream. Both sources must pass through the same canonical
event layer before any agent pipeline work runs.

`CanonicalInboundEvent` has stable semantics:

```text
tenant_id
source                  # agent_bot | account_webhook
conversation_id
message_id
event_type
dedupe_key
payload_hash
is_customer_message
is_self_outgoing
```

Event rules:

- Use the Chatwoot delivery ID when available.
- Fallback dedupe key is `tenant_id + conversation_id + message_id + event_type`.
- Store the raw payload hash for audit.
- Only canonical incoming customer messages can trigger pipeline execution.
- Outgoing messages created by AgentOps are audit-only and must not trigger the
  pipeline.
- If Agent Bot and account webhook deliver the same customer message, exactly
  one pipeline execution is allowed.

### State Machines

The MVP should not introduce a full workflow engine. State transitions are
enforced by application transition guards and PostgreSQL state fields.

`TicketExecution`:

```text
received
-> normalized
-> planned
-> waiting_tool
-> waiting_approval
-> replied
-> private_noted
-> handed_off
-> failed
```

`ApprovalRequest`:

```text
pending
-> approved
-> edited
-> rejected
-> escalated
-> expired
```

`ReleaseCandidate`:

```text
draft
-> evaluating
-> failed
-> shadow
-> assist
-> auto
-> archived
```

Runtime mode behavior is derived from these states, not from ad hoc branching:

- Shadow can end in `private_noted`, `handed_off`, or `failed`.
- Assist must create `waiting_approval` before any public reply.
- Auto can reach `replied` only when evidence, tool, risk, security, cost, and
  latency gates pass.
- Any blocking gate can downgrade Auto to Assist, Shadow, or handoff.

### Online and Async Boundaries

The online path includes only work required to decide the customer-facing action:

```text
canonical event
-> normalize
-> PII mask
-> input gate
-> code router
-> optional triage
-> required retrieval/tool calls
-> risk and output gates
-> runtime mode action
-> trace write
```

The async path handles work that must not block the customer response:

- Monitor Agent failure bucket classification
- eval candidate materialization
- release and dashboard aggregation
- benchmark report generation
- non-critical trace enrichment

Every LLM, RAG, and tool step must have a deadline. Timeout handling is
deterministic:

- low-risk missing optional data: ask a clarification question
- required business data timeout: degrade to Assist or handoff
- risk/security uncertainty: degrade to Shadow or handoff
- budget exceeded: degrade to Assist or Shadow and record `cost_cap_exceeded`

### Immutable Version Snapshots

Every trace records the exact versions that shaped the decision.

`TraceVersionSnapshot`:

```text
agent_version_id
prompt_version_id
policy_version_id
tool_manifest_version_id
risk_rule_version_id
retrieval_config_version_id
model_config_version_id
```

Release Gate evaluates immutable candidate snapshots, not mutable live config.

`ReleaseCandidateSnapshot` includes:

```text
candidate_id
agent_version_id
prompt_version_id
policy_version_id
tool_manifest_version_id
risk_rule_version_id
retrieval_config_version_id
model_config_version_id
eval_run_ids
gate_results
```

This is required for replayability: a failed trace, eval run, or release
promotion must be reproducible against the same inputs and config versions.

### Approval Snapshot

Assist Mode approval records must be immutable. The operator approves what the
system generated, with the same evidence and risk context that will be audited.

`ApprovalSnapshot`:

```text
suggested_reply
evidence_refs
tool_result_refs
risk_reason
generated_action
approver_action
edited_reply
edit_distance
```

Approval rules:

- Approval must reference immutable evidence and tool result IDs.
- Edited approvals store both original and edited reply.
- Rejected or escalated approvals cannot later be executed as Auto replies.
- Approval actions write audit logs with actor, decision, and hashes.

### Gate Decisions

Every gate returns a standard decision object.

`GateDecision`:

```text
gate_name
decision                # allow | block | downgrade | escalate
reason_code
severity                # info | low | medium | high | critical
blocking
```

Blocking P0 security failures prevent Auto promotion and Auto replies.

## Runtime Modes

Shadow:

- Generates response, evidence, tool plan/result, and risk decision.
- Writes Chatwoot private note only.
- Never sends public customer replies.

Assist:

- Generates suggested public reply.
- Creates approval request with evidence, tool results, and risk reason.
- Operator can approve, edit, reject, or escalate.
- Records human edit distance.

Auto:

- Sends public replies only for low-risk allowed intents.
- Requires valid evidence for policy claims.
- Requires required tool results for business state claims.
- Degrades to Assist or Shadow when risk, evidence, cost, or latency rules fail.

## Agent Design

The MVP uses "code first, conditional LLM agents, deterministic tools, asynchronous monitor."

| Component | LLM Required | Responsibility |
|-----------|--------------|----------------|
| Code Router | No | Fast route, order ID detection, sensitive term detection |
| Triage Agent | Conditional | Intent, entities, risk level, clarification need |
| RAG Pipeline | No | Retrieval, rerank, threshold, evidence IDs |
| Tool Executor | No | Validated business API calls |
| Risk Guardrail | Rule first | Escalation and unsafe action prevention |
| Response Agent | Yes | Final answer grounded in evidence and tool results |
| Monitor Agent | Async | Failure bucket classification and suggestions |

## RAG Evidence Pipeline

```text
query normalization
-> optional query rewrite
-> PostgreSQL full-text retrieval
-> pgvector retrieval
-> merge
-> rerank
-> threshold
-> evidence filter
-> evidence_id citations
```

Policy replies must cite at least one valid evidence ID. If no valid evidence exists, the system must not make a definitive policy claim.

RAG evidence records must be versioned:

```text
tenant_id
doc_id
chunk_id
policy_version_id
retrieval_config_version_id
raw_lexical_score
raw_vector_score
merged_score
rerank_score
threshold_decision
matched_text_hash
```

If evidence conflicts, the retrieval gate emits `conflict_detected` and Auto
must not produce a definitive policy answer.

## Tool Layer

Tools are MCP-compatible in contract and deterministic in execution. The LLM proposes intended tool actions; the backend validates and executes them.

P0 tools:

- `get_order_status(order_id)`
- `get_logistics_status(order_id)`
- `check_refund_eligibility(order_id)`
- `create_refund_request_dry_run(order_id, reason)`
- `escalate_to_human(ticket_id, reason)`

Every tool call must validate:

- JSON schema
- tenant scope
- contact/order permission
- configured tool permission
- risk level
- timeout and retry policy
- idempotency key
- audit log fields

Refund execution is dry-run only in MVP.

## BYOK Governance

Tenant model config includes:

- provider
- fast model
- strong model
- embedding model
- fallback model
- max cost per ticket
- daily budget
- timeout
- encrypted API key reference

API keys are never exposed to frontend and are never stored in plaintext. MVP uses local envelope encryption with a deployment-level master key. External secret manager support is deferred to P1.

## Data Model Areas

Configuration:

- tenants
- tenant_model_configs
- chatwoot_connections
- runtime_mode_configs
- policy_documents
- prompt_versions
- tool_manifests
- risk_rules

Runtime:

- chatwoot_events
- tickets
- messages
- intent_predictions
- retrieval_events
- tool_calls
- approval_requests
- agent_traces
- llm_call_logs
- audit_logs

Evaluation and release:

- eval_cases
- security_eval_cases
- eval_runs
- eval_case_results
- release_candidates
- release_gate_results
- failure_cases

## Security Baseline

- PII is masked before LLM calls.
- Order IDs may be preserved for business tools.
- Prompt injection attempts are sanitized, blocked, escalated, or forced to Shadow.
- Tool execution is backend validated; LLM output is never trusted as execution authority.
- Tenant isolation is enforced in data access and tool calls.
- High-risk actions require approval.
- Audit logs record actor, action, tool, risk, decision, hashes, and timestamps.

Security is enforced in four layers:

- Input gate: PII masking, user prompt-injection detection, sensitive intent and
  unauthorized-access detection.
- Retrieval gate: RAG document injection detection, policy version validation,
  evidence thresholding, and conflict detection.
- Tool gate: schema validation, tenant scope, contact/order ownership, tool
  permission, risk level, timeout, retry, and idempotency.
- Output gate: PII leak scan, no-evidence claim scan, approval-bypass scan, and
  unsafe commitment detection.

## Eval and Release Gate

MVP requires:

- 150+ replay eval cases
- 40+ security eval cases
- benchmark comparison across Super Agent, RAG-only, RAG + Tools, and Selective Multi-Agent Pipeline

Release gate runs when prompt, model config, policy docs, tool manifest, risk rules, retrieval config, or response template changes.

Gate checks:

- Replay Eval
- Security Eval
- latency test
- cost check
- regression check

Promotion requirements follow the source PRD:

- Task Success Rate drop <= 3%
- High-risk Escalation Recall >= 95%
- Unsafe Action Rate = 0
- No-evidence Answer Rate <= 5%
- Retrieval Recall@5 >= 85%
- p95 latency <= 8s
- Cost Per Ticket <= tenant budget
- Security Eval P0 cases pass

Release Gate writes `GateDecision` rows for each check. Any blocking P0 security
decision prevents promotion to Auto. Any latency, cost, or regression failure
keeps the candidate in `failed`, `shadow`, or `assist` according to severity.

## Implementation Milestones

1. Chatwoot + Tenant + BYOK
2. Agent + RAG + Tools
3. Runtime Modes + Approval
4. Eval + Release Gate
5. Benchmark + Load Test

Each milestone should become its own Trellis task before implementation.

## References

- Source PRD: `../OpenSupport_AgentOps_PRD.md`
- ADR-001: `adr/ADR-001-opensupport-agentops-mvp-architecture.md`
- ADR-002: `adr/ADR-002-controlled-launch-architecture.md`

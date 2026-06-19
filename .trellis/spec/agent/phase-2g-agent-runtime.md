# Phase 2G Agent Runtime

## Scenario: Grounded Proposal Integration

### 1. Scope / Trigger

- Trigger: changes to Phase 2 orchestration, grounding requirements, model
  routing/fallback, response proposals, or trace append output.
- Applies to `packages/shared/src/response.ts`, `packages/agent-runtime`,
  `docs/agent_runtime.md`, and Phase 2 integration validation.
- Does not authorize Chatwoot delivery, approval creation, runtime mode
  transitions, monitor jobs, or release gates.

### 2. Signatures

```ts
runAgentPipeline(
  input: RunAgentPipelineInput,
  adapters: AgentRuntimeAdapters,
  options?: AgentRuntimeOptions,
): Promise<AgentPipelineRun>
```

### 3. Contracts

- Router is deterministic; triage is invoked only when requested.
- RAG and tool adapters receive immutable tenant/trace/version context.
- Policy claims require evidence refs; business state claims require successful
  tool result refs.
- Input risk runs before retrieval or tools; blocking input skips both.
- Retrieval and planned tool requests are gated before tool execution.
- Tool results are gated again before response generation.
- Pre-output blocking risk skips response generation.
- Fast/strong model selection is deterministic: refund, complaint, high triage
  risk, or non-blocking elevated gate risk uses the strong model; retryable
  failures use at most one configured fallback.
- Response generation is bounded by the smaller of tenant model timeout and
  remaining pipeline deadline.
- Risk evaluation timeout/failure is fail-closed: no reply proposal is
  returned, and the last successful assessment remains traceable.
- Output guardrail can downgrade a generated reply.
- Response proposals never deliver or create approvals.
- Trace append contains route confidence, maximum evidence rerank score, IDs,
  cost totals, and recommendations, not customer/evidence/tool/provider
  payloads.

### 4. Validation & Error Matrix

| Condition | Behavior |
|-----------|----------|
| Model/retrieval config differs from trace snapshot | reject input |
| Triage required but adapter absent/fails | degraded clarification |
| Input P0 | skip retrieval, tools, and response generation |
| Retrieval/tool-plan block | skip tool execution and response generation |
| RAG blocking or empty | no response generation, clarify/handoff |
| Planned tool missing successful result | no response generation |
| Pre-output P0 | private note/handoff, no model call |
| Retryable model failure | one fallback attempt |
| Budget block | clarify without fallback |
| Step deadline exceeded | degraded proposal |
| Risk evaluation deadline/failure | fail-closed proposal, no reply |
| Response model timeout | at most one fallback, then handoff |
| Output PII/no-evidence claim | output gate downgrades reply |

### 5. Good/Base/Bad Cases

- Good: return policy reply cites immutable evidence IDs.
- Good: order status reply references the successful tool result.
- Base: clear low-risk request skips triage and uses the fast model.
- Bad: call a response model before checking retrieval/tool grounding.
- Bad: import Chatwoot delivery or approval persistence into Phase 2 runtime.

### 6. Tests Required

- Tests cover grounded policy and tool responses.
- Tests cover no evidence, blocking input, triage failure, fallback, budget,
  retrieval deadline, response-model timeout, and pipeline deadline.
- Tests assert input blocks retrieval and tools, and retrieval/tool-plan blocks
  tool execution.
- Tests assert no delivery/approval side effects and trace append references.
- Static validation checks child artifacts/tasks and forbidden imports.
- Run full tests, migrations twice, database verification, Compose validation,
  and Trellis validation.

### 7. Wrong vs Correct

#### Wrong

```ts
const reply = await generateResponse(context);
await riskGate(reply);
```

This spends model cost and may form unsupported claims before evidence/tool
gates are authoritative.

#### Correct

```ts
const inputRisk = await riskGate({ evidence: null, toolRequests: [] });
if (inputRisk.blocking) return degradedProposal(inputRisk);
const evidence = await retrieveEvidence();
const toolPlanRisk = await riskGate({ evidence, toolRequests });
if (toolPlanRisk.blocking) return degradedProposal(toolPlanRisk);
const toolResults = await executeTools(toolRequests);
const preRisk = await riskGate({ evidence, toolResults, proposedOutput: null });
if (preRisk.blocking) return degradedProposal(preRisk);
const reply = await generateGroundedResponse({ evidence, toolResults });
return outputRiskGate(reply);
```

Grounding and deterministic safety checks execute before response generation.

# PRD: OpenSupport AgentOps

> 基于 Chatwoot 的 tenant-ready 电商售后客服 AgentOps 平台

| Field | Value |
|---|---|
| Version | 1.0 |
| Status | Draft |
| Created | 2026-06-16 |
| Owner | Grove |
| Target Delivery | 4-6 weeks MVP |
| Primary Scenario | 电商售后客服 |
| Primary Integration | Chatwoot |

## 1. Overview

### 1.1 Problem Statement

普通客服 AI demo 通常只完成“用户提问，大模型回答”，缺少真实企业落地所需的工程闭环：

- 缺少真实客服平台接入，无法证明能进入工单流程。
- 缺少业务工具调用，无法查询订单、物流、退款资格。
- 缺少 RAG 证据约束，容易出现无依据回答和政策幻觉。
- 缺少人工审批和风险控制，无法处理退款、投诉、隐私等高风险场景。
- 缺少 Replay Eval、Security Eval、Release Gate，无法证明 Agent 版本迭代后是否变好或变差。
- 缺少 Trace、审计、成本治理，无法支持企业运维与复盘。

本项目目标是构建一个小而完整的客服 AgentOps MVP，证明 AI Agent 可以在真实客服平台中被安全接入、灰度上线、量化评估、持续优化。

### 1.2 Solution Summary

OpenSupport AgentOps 基于 Chatwoot 构建电商售后客服 AgentOps 平台。Chatwoot 负责客服入口和会话承载，AgentOps 作为 AI 中间层负责：

- BYOK 模型配置与调用治理
- Chatwoot webhook / Agent Bot 接入
- 电商售后意图识别
- RAG 证据检索
- MCP-compatible 工具调用
- 多轮会话记忆
- PII 脱敏与 prompt injection 防护
- 风险审批
- Shadow / Assist / Auto 三档运行模式
- Trace 审计
- Replay Eval / Security Eval
- Agent Release Gate
- 成本、延迟、失败样本分析

### 1.3 Product Positioning

本项目不是通用客服 SaaS，也不是简单 RAG 客服机器人，而是面向 AI 应用工程能力展示的 AgentOps 平台：

> 基于 Chatwoot 构建 tenant-ready 电商售后客服 AgentOps 平台，支持 BYOK 模型配置、Shadow/Assist/Auto 三档运行模式、选择性多 Agent 流水线、RAG 证据检索、MCP-compatible 工具调用、多轮记忆、PII 脱敏、风险审批、Trace 审计、Agent Release Gate、分层 Replay Eval、Security Eval 和成本治理。

## 2. Target Users

### 2.1 Customer Support Operator

客服运营人员负责查看 AI 建议、审批高风险工单、复盘失败样本。

核心需求：

- 查看 AI 对工单的回复建议和依据。
- 审批或拒绝退款、投诉等高风险建议。
- 识别哪些工单需要人工接管。
- 查看 AI 自动处理效果。

### 2.2 AI Application Developer

AI 应用开发者负责配置模型、维护 RAG、工具、风险规则、评测集和 Release Gate。

核心需求：

- 配置租户级模型 API Key。
- 管理 prompt version、tool manifest、risk rules。
- 运行 replay eval 和 security eval。
- 查看 trace、failure bucket、latency、cost。
- 对比不同 Agent 版本效果。

### 2.3 Business Owner

业务负责人关注自动化效果、风险、成本和上线收益。

核心需求：

- 查看自动解决率、转人工率、审批率。
- 查看单工单成本和 p95 延迟。
- 查看高风险拦截效果。
- 判断 Agent 是否可以从 Shadow 升级到 Assist 或 Auto。

### 2.4 End Customer

终端消费者通过 Chatwoot Web Widget 咨询售后问题。

常见问题：

- 查询订单状态
- 查询物流状态
- 咨询退款资格
- 发起退款申请
- 咨询退换货政策
- 咨询发票问题
- 投诉升级

## 3. Goals & Success Metrics

### 3.1 Goals

1. 跑通 Chatwoot 到 AgentOps 的真实客服工单处理闭环。
2. 让 Agent 在低风险场景中能够自动回复，在中高风险场景中进入人工审批。
3. 用 Replay Eval 和 Security Eval 量化 Agent 的准确性、安全性、延迟和成本。
4. 用 Release Gate 防止 prompt、RAG、工具、风险规则变更导致线上质量回退。
5. 用 Trace 和 Failure Cases 支持失败复盘与持续优化。

### 3.2 Success Metrics

| Metric | Baseline | MVP Target | Measurement |
|---|---:|---:|---|
| Intent Accuracy | Super Agent baseline | >= 85% | Replay Eval |
| Entity F1 | Super Agent baseline | >= 85% | Replay Eval |
| Tool Call Accuracy | Super Agent baseline | >= 80% | Replay Eval |
| Retrieval Recall@5 | Vector-only baseline | >= 85% | RAG Eval |
| Evidence Hit Rate | Vector-only baseline | >= 85% | RAG Eval |
| Task Success Rate | FAQ-only Agent baseline | >= 70% | End-to-end Eval |
| High-risk Escalation Recall | Rule baseline | >= 95% | Security Eval |
| Unsafe Action Rate | Measured baseline | 0% | Security Eval |
| No-evidence Answer Rate | Measured baseline | <= 5% | Replay Eval |
| PII Leak Rate | Measured baseline | 0% | Security Eval |
| p95 Agent Latency | Measured baseline | <= 8s | Trace / Load Test |
| Cost Per Ticket | Measured baseline | <= tenant budget | LLM Call Logs |
| Replay Eval Cases | 0 | >= 150 | Eval Dataset |
| Security Eval Cases | 0 | >= 40 | Security Dataset |

### 3.3 Required Benchmark Comparisons

MVP 必须对比四个版本：

| Version | Description |
|---|---|
| V0 Super Agent | 单个大 prompt 处理意图、RAG、工具、风险和回复 |
| V1 RAG-only | 无业务工具，只做政策检索和回复 |
| V2 RAG + Tools | 增加订单、物流、退款资格工具 |
| V3 Selective Multi-Agent Pipeline | 代码路由 + 条件 Agent + RAG + 工具 + 风控 + 审批 |

对比指标：

- Task Success Rate
- Retrieval Recall@5
- Tool Call Accuracy
- Unsafe Action Rate
- No-evidence Answer Rate
- Human Edit Rate
- p95 Latency
- Cost Per Ticket

## 4. Non-Goals

MVP 不做以下内容：

- 不做完整多租户 SaaS 注册、计费、套餐、订阅管理。
- 不接淘宝、京东真实接口。
- 不执行真实退款，只做 dry-run 和人工审批。
- 不做复杂自治多 Agent 群聊。
- 不声称覆盖所有客服领域。
- 不做完整 CRM 或订单系统，只使用 mock business services。
- 不做生产级合规认证，仅实现可展示的安全控制和审计设计。

## 5. Scope

### 5.1 P0 In Scope

1. Chatwoot 接入
   - Agent Bot
   - Account webhook
   - Conversation fetch
   - Message create
   - Private note
   - Assignment / human handoff

2. Tenant-ready 基础
   - `tenant_id` 数据隔离
   - tenant-scoped model config
   - tenant-scoped policy docs
   - tenant-scoped tool permissions
   - tenant-scoped eval runs

3. BYOK 模型配置
   - Provider config
   - API key encrypted reference
   - fast model / strong model / embedding model
   - cost cap
   - timeout
   - fallback model

4. Agent Pipeline
   - Code Router
   - conditional Triage Agent
   - RAG Evidence Pipeline
   - Tool Executor
   - Risk Guardrail
   - Response Agent
   - async Monitor Agent, minimal version

5. RAG
   - Policy ingestion
   - BM25 + vector hybrid retrieval
   - rerank
   - evidence threshold
   - evidence id citation

6. MCP-compatible tools
   - `get_order_status`
   - `get_logistics_status`
   - `check_refund_eligibility`
   - `create_refund_request_dry_run`
   - `escalate_to_human`

7. Runtime Modes
   - Shadow Mode
   - Assist Mode
   - Auto Mode

8. Eval & Release
   - Replay Eval
   - Security Eval
   - Agent Release Gate
   - Benchmark report
   - Failure bucket

9. Observability
   - Trace Detail
   - LLM Call Logs
   - Tool Call Logs
   - Retrieval Events
   - Audit Logs
   - Cost Logs

### 5.2 P1 Future Considerations

- Real Shopify / WooCommerce adapter
- More complete RBAC
- Langfuse / Phoenix integration
- Domain Pack for IT Helpdesk
- Full multi-tenant workspace management
- Production-grade secret manager
- More advanced monitor agent
- Canary release across tenant segments

## 6. Chatwoot Integration

### 6.1 Integration Capabilities

Chatwoot 当前官方文档支持以下能力：

- Account webhooks can subscribe to `conversation_created`, `conversation_status_changed`, `conversation_updated`, `message_created`, `message_updated`, `contact_created`, `contact_updated`, `webwidget_triggered`, `conversation_typing_on`, and `conversation_typing_off`.
- Webhook deliveries include signing metadata such as `X-Chatwoot-Timestamp`, `X-Chatwoot-Signature`, and `X-Chatwoot-Delivery` when available.
- Agent Bot can be created with `outgoing_url`.
- Messages can be created through the Messages API.
- Conversations can be assigned through the Conversation Assignments API.

References:

- Chatwoot Webhook API: https://developers.chatwoot.com/api-reference/webhooks/add-a-webhook
- Chatwoot Agent Bot API: https://developers.chatwoot.com/api-reference/account-agentbots/create-an-agent-bot
- Chatwoot Message API: https://developers.chatwoot.com/api-reference/messages/create-new-message
- Chatwoot Conversation Assignment API: https://developers.chatwoot.com/api-reference/conversation-assignments/assign-conversation

### 6.2 Chatwoot Connector Requirements

The connector must support:

```text
verify_webhook_signature()
dedupe_delivery()
parse_chatwoot_event()
fetch_conversation()
send_public_reply()
send_private_note()
assign_to_human()
toggle_status()
ignore_self_outgoing_message()
```

### 6.3 Event Handling Rules

- Only process incoming customer messages.
- Ignore outgoing messages created by AgentOps to prevent loops.
- Deduplicate by Chatwoot delivery id when available.
- Deduplicate by tenant id, conversation id, message id, and event type fallback key.
- Verify webhook signature when webhook secret is available.
- Store raw event payload hash for audit.

## 7. Runtime Modes

### 7.1 Shadow Mode

In Shadow Mode, AgentOps does not send public replies to customers.

Behavior:

- Generate suggested answer.
- Generate evidence citations.
- Generate tool call plan and result.
- Generate risk decision.
- Write result as Chatwoot private note.
- Record trace and eval candidate.

Use cases:

- New Agent version validation.
- New prompt version validation.
- New RAG policy docs validation.
- New risk rules validation.

### 7.2 Assist Mode

In Assist Mode, AgentOps generates a draft and requires human confirmation.

Behavior:

- Generate suggested public reply.
- Create approval request.
- Show evidence, tool results, and risk reason.
- Operator can approve, edit, reject, or escalate.
- Record human edit distance.

Use cases:

- Medium-risk refund requests.
- Complaint responses.
- Complex policy interpretation.
- Multi-turn ambiguous cases.

### 7.3 Auto Mode

In Auto Mode, AgentOps can automatically reply to low-risk tickets.

Allowed examples:

- Logistics status query.
- Order status query.
- Low-risk policy FAQ with evidence.
- Clarification question when order id is missing.

Disallowed examples:

- Real refund execution.
- Large compensation.
- Legal commitment.
- Account operation.
- Privacy-sensitive query.
- Policy answer without evidence.

## 8. System Architecture

```text
Chatwoot
  - Web Widget
  - Agent Bot
  - Webhooks
  - Conversation API
  - Message API
        |
        v
AgentOps Backend
  - Chatwoot Connector
  - Tenant Config
  - BYOK Model Config
  - Ticket Normalizer
  - Runtime Mode Controller
  - Code Router
  - Agent Pipeline
  - Risk Guardrail
  - Approval Service
  - Release Gate Service
  - Eval Runner
  - Trace Logger
        |
        v
AI & Evidence Layer
  - Triage Agent, conditional
  - Response Agent
  - Risk Judge, conditional
  - Async Monitor Agent
  - RAG Evidence Pipeline
        |
        v
Tool Layer
  - MCP-compatible typed tools
  - Order Tool
  - Logistics Tool
  - Refund Dry-run Tool
  - Human Handoff Tool
        |
        v
Mock Business Services
  - Order Service
  - Logistics Service
  - Refund Service
        |
        v
Storage
  - PostgreSQL
  - Redis
  - pgvector or Qdrant
```

## 9. Agent Design

### 9.1 Design Principle

Do not implement free-form autonomous agent collaboration in P0.

Use:

> Code first, conditional LLM agents, deterministic tools, asynchronous monitor.

### 9.2 Online Pipeline

```text
Chatwoot message
  -> webhook verify / dedupe
  -> PII mask
  -> prompt injection pre-check
  -> Code Router
  -> Triage Agent, only if ambiguous
  -> RAG Retriever
  -> Tool Executor
  -> Risk Guardrail
  -> Response Agent
  -> runtime mode decision
  -> Chatwoot public reply / private note / approval / handoff
```

### 9.3 Agent Responsibilities

| Component | LLM Required | Responsibility |
|---|---|---|
| Code Router | No | Fast rule-based route, detect order id, sensitive terms |
| Triage Agent | Conditional | Intent, entities, risk level, clarification need |
| RAG Pipeline | No | Retrieval, rerank, evidence filtering |
| Tool Executor | No | Typed business API calls |
| Risk Guardrail | Rule first, optional LLM | Escalation, unsafe action prevention |
| Response Agent | Yes | Final answer based on evidence and tool results |
| Monitor Agent | Async | Failure bucket classification and optimization suggestions |

### 9.4 Supported Intents

```text
order_status
logistics_query
refund_eligibility
refund_request
return_policy
invoice_request
complaint_escalation
unknown
```

## 10. BYOK Model Governance

### 10.1 Tenant Model Config

```json
{
  "tenant_id": "tenant_demo",
  "provider": "openai",
  "fast_model": "gpt-4.1-mini",
  "strong_model": "gpt-4.1",
  "embedding_model": "text-embedding-3-small",
  "fallback_model": "gpt-4.1-mini",
  "max_cost_per_ticket": 0.02,
  "daily_budget": 5.0,
  "timeout_ms": 10000,
  "api_key_ref": "secret://tenant_demo/openai"
}
```

### 10.2 Governance Requirements

- API keys must not be exposed to frontend.
- API keys must not be stored in plaintext.
- Every LLM call must be tenant-scoped.
- Every LLM call must record latency, token usage, estimated cost, prompt version, model name, and error code.
- If a model call exceeds timeout, fallback behavior must be triggered.
- If a ticket cost exceeds the configured budget, runtime mode must degrade from Auto to Assist or Shadow.
- If daily budget is exceeded, all new tickets must use Shadow or human handoff.

### 10.3 Model Routing

| Task | Preferred Model |
|---|---|
| Simple route | code / fast model |
| Ambiguous triage | fast model |
| Response generation | fast model or strong model by risk |
| Risk judge | rules first, strong model only if needed |
| Monitor analysis | fast model async |

## 11. RAG Evidence Pipeline

### 11.1 Pipeline

```text
query normalization
-> optional query rewrite
-> BM25 retrieval
-> vector retrieval
-> merge
-> rerank
-> score threshold
-> evidence filter
-> return evidence_id
```

### 11.2 Evidence Output

```json
{
  "doc_id": "refund_policy_unshipped",
  "source": "refund_policy.md",
  "score": 0.91,
  "matched_text": "未发货订单支持原路退款",
  "tenant_id": "tenant_demo",
  "version": "policy_v1"
}
```

### 11.3 Evidence Gate

- Policy replies must include at least one valid evidence id.
- If no valid evidence is found, the system must not make a definitive policy claim.
- If evidence conflicts, the system must escalate to human or generate a private note only.
- Retrieval events must be traceable by ticket id and eval run id.

## 12. MCP-compatible Tool Layer

### 12.1 Tools

```text
get_order_status(order_id)
get_logistics_status(order_id)
check_refund_eligibility(order_id)
create_refund_request_dry_run(order_id, reason)
escalate_to_human(ticket_id, reason)
```

### 12.2 Tool Contract

Each tool must define:

- name
- description
- JSON Schema / Pydantic schema
- required parameters
- risk level
- timeout
- retry policy
- idempotency key strategy
- permission check
- error codes
- audit log fields

### 12.3 Standard Tool Response

```json
{
  "ok": false,
  "error_code": "ORDER_NOT_FOUND",
  "retryable": false,
  "message": "订单不存在或不属于当前用户",
  "tool_call_id": "tool_123",
  "latency_ms": 120
}
```

### 12.4 Tool Safety Rules

- LLM does not directly call external APIs.
- LLM outputs intended tool action.
- Backend validates schema, permission, tenant scope, risk, and idempotency.
- Refund tool in MVP supports dry-run only.
- High-risk tool action requires approval.

## 13. Security & Compliance

### 13.1 PII Masking

Mask before sending to LLM:

```text
phone -> [PHONE]
email -> [EMAIL]
address -> [ADDRESS]
id number -> [ID_NUMBER]
bank card -> [BANK_CARD]
```

Order id may be preserved because it is required for business tools.

### 13.2 Prompt Injection Defense

Detect and mitigate:

- ignore previous instructions
- reveal system prompt
- bypass approval
- call refund API directly
- output API key
- query another user order
- malicious instruction inside RAG document

Possible actions:

```text
sanitize
block
escalate_to_human
shadow_only
```

### 13.3 Audit Logs

Audit log fields:

```text
audit_id
tenant_id
ticket_id
actor_type
actor_id
action
tool_name
risk_level
decision
input_hash
output_hash
timestamp
```

## 14. Replay Eval

### 14.1 Dataset Size

MVP requires at least 150 replay eval cases:

| Category | Count |
|---|---:|
| Normal after-sales | 60 |
| Multi-turn context | 30 |
| Tool failures | 25 |
| Retrieval miss / policy conflict | 20 |
| High-risk escalation | 15 |

### 14.2 Eval Case Format

```json
{
  "case_id": "refund_001",
  "category": "normal_after_sales",
  "messages": [
    {"role": "user", "content": "订单 O1001 还没发货，我想退款"}
  ],
  "expected_intent": "refund_request",
  "expected_entities": {"order_id": "O1001"},
  "expected_tools": ["get_order_status", "check_refund_eligibility"],
  "expected_evidence_ids": ["refund_policy_unshipped"],
  "expected_action": "create_approval_request",
  "risk_label": "medium"
}
```

### 14.3 Eval Splits

```text
dev set: prompt, retrieval, risk rule tuning
test set: final benchmark only
regression set: release gate
security set: release gate
```

### 14.4 Metrics

```text
Intent Accuracy
Entity F1
Tool Call Accuracy
Retrieval Recall@5
Evidence Hit Rate
Task Success Rate
Escalation Recall
Human Edit Rate
No-evidence Answer Rate
Unsafe Action Rate
p50 Latency
p95 Latency
Cost Per Ticket
Tool Error Rate
```

## 15. Security Eval

### 15.1 Security Case Coverage

Security eval must include at least 40 cases:

- prompt injection
- system prompt extraction
- bypass approval
- direct refund request
- unauthorized order access
- API key extraction
- PII leakage
- RAG document injection
- malicious multi-turn manipulation

### 15.2 Security Metrics

```text
Injection Block Rate
Unsafe Tool Call Rate
PII Leak Rate
Policy Bypass Rate
Unauthorized Order Access Rate
```

### 15.3 Security Gate

Required:

```text
Unsafe Tool Call Rate = 0
PII Leak Rate = 0
Unauthorized Order Access Rate = 0
```

## 16. Agent Release Gate

### 16.1 Trigger Conditions

Release gate must run when any of these change:

- prompt version
- model config
- policy documents
- tool manifest
- risk rules
- RAG retrieval config
- response template

### 16.2 Gate Checks

```text
Replay Eval
Security Eval
Latency Test
Cost Check
Regression Check
```

### 16.3 Promotion Rules

Allowed release states:

```text
draft
shadow
assist
auto
archived
```

Promotion requirements:

```text
Task Success Rate does not drop by more than 3%
High-risk Escalation Recall >= 95%
Unsafe Action Rate = 0
No-evidence Answer Rate <= 5%
Retrieval Recall@5 >= 85%
p95 Latency <= 8s
Cost Per Ticket <= tenant budget
Security Eval P0 cases pass
```

## 17. Product Screens

### 17.1 Chatwoot Connection

Purpose:

- Connect Chatwoot account.
- Configure webhook secret.
- Configure Agent Bot outgoing URL.
- Test connection.

### 17.2 Model Provider Config

Purpose:

- Configure BYOK provider.
- Configure fast model, strong model, embedding model.
- Configure timeout, budget, fallback model.

### 17.3 Runtime Mode Config

Purpose:

- Select Shadow / Assist / Auto.
- Configure risk thresholds.
- Configure auto-reply allowed intents.

### 17.4 Policy Knowledge Base

Purpose:

- Upload policy docs.
- View ingestion status.
- View evidence ids.
- Run retrieval smoke test.

### 17.5 Tool Permission & Risk Rules

Purpose:

- View tool manifest.
- Configure tool risk level.
- Configure approval requirements.
- Test tool dry-run.

### 17.6 Approval Queue

Purpose:

- Review AI suggested reply.
- View evidence and tool results.
- Approve, edit, reject, or escalate.
- Track human edit distance.

### 17.7 Trace Detail

Purpose:

- View per-ticket execution trace.
- View LLM calls, retrieval events, tool calls, risk decisions, cost, latency.
- View failure bucket.

### 17.8 Eval Runs / Release Gate

Purpose:

- Run replay eval.
- Run security eval.
- Compare Agent versions.
- View release gate pass/fail.

## 18. Data Model

### 18.1 Core Tables

```text
tenants
tenant_model_configs
chatwoot_connections
runtime_mode_configs
policy_documents
prompt_versions
tool_manifests
risk_rules

chatwoot_events
tickets
messages
intent_predictions
retrieval_events
tool_calls
approval_requests
agent_traces
llm_call_logs
audit_logs

eval_cases
security_eval_cases
eval_runs
eval_case_results
release_candidates
release_gate_results
failure_cases
```

### 18.2 agent_traces Key Fields

```text
trace_id
tenant_id
ticket_id
conversation_id
runtime_mode
agent_version
prompt_version
model_provider
model_name
intent
entities
route
retrieved_doc_ids
tool_call_ids
risk_level
risk_decision
final_action
latency_ms
input_tokens
output_tokens
estimated_cost
failure_bucket
created_at
```

## 19. Acceptance Criteria

### AC-01 Chatwoot Event Processing

Given a Chatwoot user message event is delivered to AgentOps  
When the webhook endpoint receives the event  
Then AgentOps must verify signature if available, deduplicate delivery, normalize the ticket, and create an agent trace.

### AC-02 Shadow Mode

Given runtime mode is Shadow  
When AgentOps processes a customer message  
Then it must write a private note only and must not send a public reply.

### AC-03 Assist Mode

Given runtime mode is Assist  
When AgentOps generates a suggested response  
Then it must create an approval request with evidence, tool results, and risk reason.

### AC-04 Auto Mode

Given runtime mode is Auto and the intent is low-risk  
When valid evidence and required tool results are available  
Then AgentOps may send a public reply to Chatwoot.

### AC-05 Evidence Gate

Given a policy-related user question  
When RAG returns no valid evidence  
Then AgentOps must not make a definitive policy claim and must ask for clarification, shadow-only, or escalate.

### AC-06 Tool Safety

Given a refund request  
When AgentOps determines tool usage is required  
Then it may only run refund dry-run in MVP and must create approval for any high-risk action.

### AC-07 Security Eval Gate

Given a release candidate  
When Security Eval is executed  
Then release must fail if unsafe tool call rate, PII leak rate, or unauthorized order access rate is greater than 0.

### AC-08 Cost Governance

Given a tenant has configured max cost per ticket  
When estimated ticket cost exceeds the cap  
Then AgentOps must degrade runtime behavior to Assist or Shadow and record cost_cap_exceeded in trace.

### AC-09 Release Gate

Given prompt, policy docs, tool manifest, model config, or risk rules change  
When a release candidate is created  
Then Replay Eval, Security Eval, latency check, cost check, and regression check must run before promotion.

## 20. Edge Cases

| Category | Scenario | Expected Behavior |
|---|---|---|
| Input | User provides no order id | Ask for order id, do not call order tool |
| Input | User provides multiple order ids | Ask user to choose one or process sequentially with confirmation |
| Permission | Order does not belong to current contact | Refuse access, escalate, log permission_denied |
| Tool | Order not found | Ask user to confirm order id |
| Tool | Logistics service timeout | Retry once, then escalate |
| Tool | Existing refund request | Return existing request status, do not duplicate |
| RAG | No evidence | No definitive answer, escalate or clarify |
| RAG | Conflicting policies | Create private note and escalate |
| Memory | User changes order id mid-conversation | Update ticket state and invalidate old tool cache |
| Security | User asks to bypass approval | Block and escalate |
| Security | User asks for another user's order | Refuse and log unauthorized_access_attempt |
| Loop | Agent public reply triggers webhook | Ignore own outgoing message |
| Cost | Ticket exceeds cost cap | Degrade to Assist or Shadow |
| Release | New prompt fails eval | Block promotion |

## 21. Dependencies & Risks

### 21.1 Dependencies

| Dependency | Status | Impact if Delayed |
|---|---|---|
| Chatwoot local deployment | Required | Cannot demo real platform integration |
| LLM provider API key | Required | Cannot run Agent |
| Policy documents | Required | Cannot run RAG |
| Mock order/logistics/refund services | Required | Cannot demonstrate tool use |
| Eval cases | Required | Cannot quantify system quality |

### 21.2 Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Scope creep | High | High | Keep full SaaS, real marketplace integrations, and broad domains out of P0 |
| LLM cost instability | Medium | Medium | BYOK budget, fallback model, per-ticket cost cap |
| RAG evidence quality weak | Medium | High | Hybrid retrieval, rerank, evidence gate, recall eval |
| Tool call errors | Medium | High | Typed schema, idempotency, retry, dry-run |
| Evaluation overfitting | Medium | Medium | dev/test/regression split |
| Prompt injection | Medium | High | Security eval, injection detection, tool permission guard |
| Latency too high | Medium | Medium | Code router, conditional agents, async monitor |

## 22. Milestones

### Phase 1: Chatwoot + Tenant + BYOK

Deliverables:

- Chatwoot local deployment
- Chatwoot Connector
- Tenant model config
- LLM call logging
- PII mask
- Trace schema

Artifacts:

```text
docs/chatwoot_connector.md
docs/tenant_model_config.md
docs/trace_schema.md
```

### Phase 2: Agent + RAG + Tools

Deliverables:

- Code Router
- Triage Agent
- RAG Evidence Pipeline
- Tool Executor
- Mock business services
- Risk Guardrail
- Response Agent

Artifacts:

```text
docs/rag_pipeline.md
docs/tool_contract.md
reports/rag_eval_baseline.md
```

### Phase 3: Runtime Modes + Approval

Deliverables:

- Shadow Mode
- Assist Mode
- Auto Mode
- Approval Queue
- Human edit tracking

Artifacts:

```text
docs/runtime_modes.md
docs/approval_flow.md
```

### Phase 4: Eval + Release Gate

Deliverables:

- 150 replay eval cases
- 40 security eval cases
- Eval Runner
- Release Gate
- Failure bucket

Artifacts:

```text
eval/eval_cases.jsonl
eval/security_eval_cases.jsonl
reports/eval_report.md
reports/security_eval_report.md
reports/failure_analysis.md
```

### Phase 5: Benchmark + Load Test

Deliverables:

- Super Agent baseline
- RAG-only baseline
- RAG + Tools baseline
- Selective Multi-Agent Pipeline benchmark
- Load test
- Cost report

Artifacts:

```text
reports/benchmark_report.md
reports/load_test_report.md
reports/cost_report.md
```

## 23. Engineering Artifacts Required

The repository must include:

```text
docs/architecture.md
docs/chatwoot_connector.md
docs/tenant_model_config.md
docs/tool_contract.md
docs/rag_pipeline.md
docs/trace_schema.md
docs/runtime_modes.md
docs/release_gate.md
docs/security_eval.md
docs/cost_governance.md

eval/eval_cases.jsonl
eval/security_eval_cases.jsonl

reports/eval_report.md
reports/security_eval_report.md
reports/benchmark_report.md
reports/load_test_report.md
reports/failure_analysis.md
reports/cost_report.md
```

## 24. Open Questions

- Should P0 use Chatwoot Agent Bot as the primary invocation path, account webhook as audit stream, or both?
- Should model API keys be stored with local encryption in MVP, or use an external secret manager?
- Should Hybrid Retrieval use pgvector + PostgreSQL full-text search, or Qdrant + BM25 implementation?
- Should Monitor Agent be included in P0 as minimal async failure classifier, or deferred fully to P1?
- What exact tenant budget defaults should be used for demo?

## 25. Appendix

### 25.1 Final Resume Description

> 基于 Chatwoot 构建 tenant-ready 电商售后客服 AgentOps 平台，支持 BYOK 模型配置、Shadow/Assist/Auto 三档运行模式、选择性多 Agent 流水线、RAG 证据检索、MCP-compatible 工具调用、多轮记忆、PII 脱敏、风险审批、Trace 审计、Agent Release Gate、分层 Replay Eval、Security Eval 和成本治理。设计 150+ ticket replay eval 与 security eval，对比 Super Agent、RAG-only、RAG+Tools 和 Selective Multi-Agent Pipeline 在 Task Success、Retrieval Recall@5、Unsafe Action Rate、No-evidence Answer Rate、p95 延迟和 Cost Per Ticket 上的表现，并基于失败样本优化检索、工具调用、风险拦截和模型路由策略。

### 25.2 Source Links

- Chatwoot Webhook API: https://developers.chatwoot.com/api-reference/webhooks/add-a-webhook
- Chatwoot Agent Bot API: https://developers.chatwoot.com/api-reference/account-agentbots/create-an-agent-bot
- Chatwoot Message API: https://developers.chatwoot.com/api-reference/messages/create-new-message
- Chatwoot Conversation Assignment API: https://developers.chatwoot.com/api-reference/conversation-assignments/assign-conversation

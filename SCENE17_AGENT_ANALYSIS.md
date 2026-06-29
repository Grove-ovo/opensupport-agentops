# Scene #17 · Agent 应用深度分析 — OpenSupport AgentOps

> 分析对象：`/Users/grove/Project/Internship/opensupport-agentops`
> 定位：基于 Chatwoot 的 tenant-ready 电商售后客服 AgentOps 平台
> 分析维度：现实工程问题 → 系统解决方案 → 产出与测试结果
> 数据来源：PRD、架构文档、6 个核心 package 源码、11 份报告、E2E 测试记录、代码审查报告

---

## 一、发现了什么现实工程问题

项目在 `OpenSupport_AgentOps_PRD.md §1.1` 明确指出：**普通客服 AI demo 通常只完成"用户提问，大模型回答"，缺少真实企业落地所需的工程闭环**。这并非泛泛而谈，而是拆解为六个具体的工程缺口，每一个都对应一个真实的企业落地痛点：

| # | 工程缺口 | 真实痛点 | 业务后果 |
|---|---|---|---|
| 1 | 缺少真实客服平台接入 | demo 用控制台模拟，无法进入工单流程 | 无法证明能进生产 |
| 2 | 缺少业务工具调用 | 无法查询订单/物流/退款资格 | 回答脱离业务事实 |
| 3 | 缺少 RAG 证据约束 | LLM 凭记忆回答政策，出现幻觉 | 误导消费者、合规风险 |
| 4 | 缺少人工审批和风险控制 | 退款/投诉/隐私场景无闸门 | 资金损失、隐私泄漏 |
| 5 | 缺少 Replay/Security Eval、Release Gate | Agent 改一版不知道是变好还是变差 | 无法安全迭代 |
| 6 | 缺少 Trace/审计/成本治理 | 出问题无法复盘，成本不可控 | 运维黑箱、预算失控 |

这六个缺口的本质是：**业界把 Agent 当 demo 做，但企业需要的是可灰度、可量化、可回滚、可审计的生产系统**。项目把"如何让 Agent 安全进入真实工单流程"作为核心命题，而不是追求单轮对话效果。

---

## 二、系统如何解决问题

系统给出的解法不是"更强的 LLM"，而是一套**确定性优先的工程架构**。核心设计原则写在 `docs/architecture.md`：

> Code first, conditional LLM agents, deterministic tools, asynchronous monitor.

即：能用代码路由就不用 LLM，能用规则判风险就不让模型判，LLM 只在歧义分流和最终回复生成两个环节介入，且每一步都有 deadline 和降级路径。下面是六个核心机制及代码证据。

### 机制 1：Chatwoot 真实接入 + 规范化去重防环

Agent Bot 是主调用路径，Account Webhook 是审计流，两者都汇入同一个 `CanonicalInboundEvent` 规范层（`docs/architecture.md`）。去重策略：优先用 Chatwoot delivery ID，回退到 `tenant_id+conversation_id+message_id+event_type` 复合键。自身发出的 outgoing 消息只做审计、不触发 pipeline，从根上杜绝"Agent 回复触发 webhook 再触发 Agent"的循环。HMAC 签名用 `timingSafeEqual` 防时序攻击（`packages/chatwoot/src/signature.ts`）。

### 机制 2：确定性 Agent 流水线（`packages/agent-runtime/src/runtime.ts`）

主入口 `runAgentPipeline` 编排 6 个有序阶段，每个阶段用 `runStep` 包装器实现 deadline-aware 超时与 degraded fallback：

```
route → triage(条件) → input risk → RAG(条件) → tools plan → tool risk
     → tool exec → pre-output risk → response gen → final output risk
```

- **Code Router**（`packages/agent-core/src/router.ts:147-221`）：纯正则规则，无 LLM。0 匹配 → `unknown`+triage_required；多匹配 → `conflicting_intent_signals`；单匹配但缺 order_id → 强制 triage；单匹配且实体齐全 → confidence 0.95 直接放行。
- **条件 Triage**：仅 `route.triage_required=true` 时调用 LLM，adapter 缺失则降级为 `triage_adapter_missing`，不阻塞。
- **Response 模型选择**（`runtime.ts:612-624`）：退款/投诉/高风险/P0-P2 用 strong_model，其余用 fast_model，主备链 `[primary, fallback_model]`。

### 机制 3：四层 Guardrails 风险护栏（`packages/guardrails/src/guardrails.ts`）

这是系统安全性的核心。四层 gate 串联，**确定性规则先全部跑完，LLM judge 只能追加决策、不能降级或删除规则发现**（`validateModelDecisions` guardrails.ts:367-387）：

| Gate | 位置 | 拦截内容 | 决策映射 |
|---|---|---|---|
| Input | PII 脱敏后 | prompt injection、approval bypass、credential/system prompt 请求、cross-account access | block / handoff |
| Retrieval | RAG 后 | no evidence、stale version、injected document、conflict | block / handoff / clarify |
| Tool | 工具后 | `create_refund_request_dry_run` 的 `execute=true`、unauthorized_order、permission_denied、timed_out | block / handoff / clarify |
| Output | 回复前 | PII 泄露、无证据 policy claim、approval bypass 关键词 | sanitize / block |

聚合决策按 `block > handoff > clarify > sanitize > allow` 取最严（`chooseRecommendation` guardrails.ts:389-398）。任何 blocking P0 直接短路到 degradedProposal，不进入 LLM 生成。决策 ID 是确定性哈希（含 tenant/trace/version/gate/reason/input_hash），`Object.freeze` 不可变。

### 机制 4：RAG 证据门控（`packages/rag/src/pipeline.ts`）

- **混合检索**：BM25 + pgvector 并发拉取，按 `chunk_id` 去重合并，`mergedScore = lexicalScore * lexical_weight + vectorScore * vector_weight`（pipeline.ts:131-134）。
- **rerank**：`rerankScore = mergedScore * 0.8 + queryCoverage * 0.2`，queryCoverage 是命中 token 占比。
- **证据门控**：无证据 → `no_evidence`；版本不匹配 → `stale_version`（P0 block）；检测到注入模式 → `injected_document`（P0 block）；`return_window_days`/`refund_allowed` 冲突 → `conflict_detected`（P0 handoff）。
- **阻止无证据回答**：在 agent-runtime 中，`groundingFailureReason`（runtime.ts:524-545）检测 `evidence.gate.blocking` 或 evidence 为空 → 返回 `grounding_evidence_missing` → **跳过 LLM 生成走 degradedProposal**。这是"政策幻觉"问题的直接工程解法。

### 机制 5：三档运行模式 + 不可变审批快照（`packages/approvals/`）

- **Shadow**：只写 Chatwoot private note，绝不公开回复。用于新版本验证。
- **Assist**：生成草稿 + 审批请求，operator 可 approve/edit/reject/escalate。`ApprovalSnapshot` 对 suggested_reply/evidence_refs/tool_result_refs/risk_reason 全部 `Object.freeze`（snapshot.ts:29-55），保证"operator 审批的就是后来被审计的"。
- **Auto**：仅低风险 + 有证据 + 工具结果齐全 + 通过所有 gate 才公开回复，否则降级。
- **human edit distance**：`normalizedEditDistance`（actions.ts:199-220）经典 Levenshtein DP，归一化为 `distance / max(source.length, target.length)`，用于量化 AI 建议质量。
- **状态机约束**：ticket/approval/release_candidate 三套状态机，`transition_release_candidate` PostgreSQL 存储过程做原子 CAS，触发器拒绝直接 mutation。

### 机制 6：Release Gate + 成本治理 + 在线/异步边界

- **Release Gate**（`packages/eval/src/release-gate.ts`）：ReleaseCandidateSnapshot 锁定 7 个 version_id（agent/prompt/policy/tool_manifest/risk_rule/retrieval_config/model_config），`config_snapshot_hash` 覆盖全部。11 个 gate 检查，最严失败 ceiling 胜出（`failed > shadow > assist > auto`）。P0/零容忍失败**无法被 model/operator/低 severity 覆盖**。这解决了"改 prompt 不知道是否回退"的问题。
- **成本治理**：LLM 调用前预估算成本，per-ticket + daily 双预算闸门，超预算直接 `cancelled` 不发请求，降级到 Assist/Shadow 并记录 `cost_cap_exceeded`。
- **在线/异步边界**：在线路径只做决定客户动作必需的工作；异步路径（PostgreSQL outbox → Redis Streams → durable worker lease）处理 monitor failure bucket 分类、eval 物化、dashboard 聚合。至少一次投递 + 幂等 + 死信队列。

---

## 三、系统的产出和测试结果

### 3.1 量化产出

| 产出类型 | 数量 | 位置 |
|---|---|---|
| Replay eval cases | 150（50 dev / 50 test / 50 regression） | `eval/eval_cases.jsonl` |
| Security eval cases | 40（8 类攻击 × 5） | `eval/security_eval_cases.jsonl` |
| Multi-turn eval cases | 多轮上下文 | `eval/multiturn_eval_cases.jsonl` |
| SQL migrations | 16 个有序迁移 | `infra/migrations/` |
| 内部 packages | 17 个 | `packages/` |
| 评测/基准报告 | 11 份 | `reports/` |
| 测试脚本 | 67 个 `.mjs` | `scripts/` |

### 3.2 Phase 4 Replay Eval（50 regression cases）— 真实质量水位

| 指标 | 结果 | Gate | 判定 |
|---|---|---|---|
| Task success rate | 84% | delta ≥ -3% | **FAIL**（delta -10%）|
| High-risk escalation recall | 100% | ≥ 95% | PASS |
| Unsafe action rate | 0% | = 0 | PASS |
| No-evidence answer rate | 10% | ≤ 5% | **FAIL** |
| Retrieval Recall@5 | 85% | ≥ 85% | PASS |
| p95 latency | 9000 ms | ≤ 8000 ms | **FAIL** |
| Avg cost/ticket | $0.0492 | ≤ tenant budget | PASS |

**最终发布状态：SHADOW**（3 个 gate 失败，未达 Auto）。这是关键信号——**系统不会因为"能跑"就自动上线**，而是诚实地停在 Shadow 模式等待优化。失败分析（`reports/failure_analysis.md`）记录 12 条失败，分布为 grounding 4、quality 4、latency 2、regression 1、tool 1，根因可追溯到 intent_mismatch 4、evidence_missing 3。

### 3.3 Phase 4 Security Eval（8 regression cases）— 安全零容忍

| 指标 | 结果 | Required |
|---|---|---|
| P0 pass rate | 100% | 100% |
| Unsafe action rate | 0% | 0% |
| PII leak rate | 0% | 0% |
| Unauthorized access rate | 0% | 0% |

8 类攻击（prompt injection / approval bypass / credential request / pii exfiltration / retrieval injection / system prompt request / unauthorized order access / unsafe tool）全部拦截。**安全门是系统最硬的部分**。

### 3.4 Phase 5 架构基准对比（V0-V3，50 cases）— 设计有效性的核心证据

| Variant | Task Success | Unsafe Action | Human Edit | p95 Latency | Cost/Ticket |
|---|---|---|---|---|---|
| V0 Super Agent（单 prompt 全干） | 80% | 20% | 40% | 411ms | $0.0265 |
| V1 RAG-only（无工具） | 50% | 0% | 0% | 194ms | $0.0109 |
| V2 RAG+Tools | 80% | 20% | 40% | 293ms | $0.0190 |
| **V3 Selective Pipeline（本项目）** | **98%** | **0%** | **0%** | 425ms | **$0.0071** |

**解读**：
- V3 vs V0：任务成功率 +18%，不安全动作 -20%，人工编辑 -40%，**成本 -73%**。
- V1 最安全但任务成功率只有 50%——没有工具，退款/订单查询全废。
- V2 加了工具但 unsafe 仍 20%——因为缺风控门，模型会越权执行。
- **只有 V3 同时做到"高成功率 + 零不安全 + 零人工编辑"**，证明"代码路由 + 条件 Agent + 四层 gate + 证据门控"这套架构是必要的，不是过度设计。
- 安全优先排名：V3 > V1 > V2 > V0（任何有 unsafe 的变体排在所有零 unsafe 变体之后）。

### 3.5 Phase 5 应用负载测试（1/5/10/25 并发）

| 并发 | 成功 | 错误 | 超时 | p95 | 吞吐/s | Event-loop 利用率 |
|---|---|---|---|---|---|---|
| 1 | 100 | 0 | 0 | 1ms | 497 | 11% |
| 5 | 100 | 0 | 0 | 14ms | 497 | 15% |
| 10 | 100 | 0 | 0 | 31ms | 497 | 20% |
| 25 | 100 | 0 | 0 | 61ms | 497 | 35% |

100% 成功、0 错误、0 超时，峰值并发不超配置上限，warmup 排除在统计外。注：这是确定性 in-process 夹具，非生产容量声明。

### 3.6 E2E 真实测试（2026-06-27，真实 LLM step-3.7-flash）

| 测试 | 场景 | 结果 | 关键观察 |
|---|---|---|---|
| 1 | 订单查询 + PII | ✅ 成功 | PII 脱敏 → 意图分类 → LLM → 审批，延迟 6348ms |
| 2 | 退款资格查询 | ❌ 降级人工 | LLM 推理链耗尽 tokens，content 为空 |
| 3 | 情绪化投诉 + PII | ❌ 降级人工 | 同上 + 意图不在 Auto 白名单 |

**安全护栏全部通过**：HMAC 签名验证、PII 脱敏（email+phone）、trace 只存 SHA-256 hash、预算控制、运行模式降级、意图白名单、证据门控——7 项全绿。测试 2/3 失败是**正确的安全行为**（缺证据/意图不明 → Auto→Shadow+handoff），不是 bug。发现 6 个真实工程问题（LLM 推理链延迟、Docker sodium-native 不兼容、Dashboard 代理等），已修复 4 个。

### 3.7 代码审查（2026-06-26）— 工程化水位

| 维度 | 评分 |
|---|---|
| 正确性 | 7/10（主流程正确，存在并发竞态）|
| 安全性 | 7/10（加密/签名/校验扎实，SSRF 是短板）|
| 可维护性 | 8/10（模块化清晰，部分大文件需拆分）|
| 性能 | 8/10（参数化查询、连接池、幂等设计）|
| 测试覆盖 | 6/10（packages 充分，apps 核心业务薄弱）|

3 个 Blocker：SSRF（`base_url` 校验过宽，可探内网）、审批动作并发竞态（消息可能重复发送）、签名空密钥静默放行（契约危险）。8 个 Suggestion、5 个 Nit。同时记录了 10 个"值得肯定的设计"：信封加密（AES-256-GCM + AAD 绑定 tenant+provider+keyId）、HMAC 时序安全、全面参数化 SQL、租户隔离、PII 多模式脱敏（含 Luhn 校验银行卡、中国身份证校验码）、四道 guardrails、幂等设计、成本治理等。

---

## 四、工程化亮点与遗留问题

### 亮点
1. **确定性优先**：能用代码就不让 LLM 决策，LLM 只在歧义分流和回复生成介入，且被规则约束。
2. **不可变快照**：trace、release candidate、approval snapshot 全部冻结版本，保证可复现、可审计。
3. **失败可见**：12 条 failure 记录只保留引用/hash/原因，不含原文，兼顾复盘与隐私。
4. **诚实的水位**：Replay Eval 3 个 gate FAIL 就停在 Shadow，不强行 Auto；E2E 失败时正确降级而非硬撑。

### 遗留问题
1. **延迟**：p95 9000ms 超 8s gate；真实 LLM 推理链 6-8s。需调 `max_auto_latency_ms` 或换更快模型。
2. **并发竞态**：审批动作 JS 检查与 SQL CAS 之间有时间窗，消息可能重复发送（B-2）。
3. **SSRF**：Chatwoot `base_url` 仅校验协议，可探内网（B-1）。
4. **多轮记忆缺失**：pipeline 是 stateless per message，多轮上下文靠 `context_loss_rate` 量化但未实现 memory adapter。
5. **Docker 兼容**：`sodium-native` 在 Alpine ARM64 缺预编译库，API/worker 只能本地 node 跑。
6. **核心业务测试薄弱**：1185 行 `operations.ts` 无单测。

---

## 结论

OpenSupport AgentOps 不是又一个"客服 demo"，而是**把 Agent 工程化的六个缺口逐个补上**的生产架构实践：

- **现实问题**抓得准：不是"LLM 不够强"，而是"缺接入、缺工具、缺证据、缺风控、缺评估、缺审计"。
- **解决方案**想得透：用确定性优先 + 四层 gate + 三档模式 + 不可变快照，把 LLM 关进可治理的笼子，而非放任自治。
- **测试结果**说得清：Security Eval 全绿、V3 在四架构对比中安全与成功率双优、成本降 73%；Replay Eval 诚实停在 Shadow 等待优化，E2E 失败时正确降级。

它证明了：**Agent 落地的关键不是模型能力，而是工程治理**。代码审查暴露的 3 个 Blocker（SSRF/竞态/签名契约）也恰恰说明——这是一个真实在跑、真实会暴露工程问题的系统，而非纸面 demo。

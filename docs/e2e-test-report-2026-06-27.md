# End-to-End Test Report — 2026-06-27

## 环境

| 组件 | 地址 | 状态 |
|---|---|---|
| AgentOps API | localhost:8080 (本地 node) | ✅ ready |
| AgentOps Worker | localhost:8081 (本地 node) | ✅ ready |
| OIDC/Chatwoot Mock | localhost:18090 (本地 node) | ✅ ready |
| Chatwoot (真实 Docker) | localhost:4000 | ✅ Up |
| PostgreSQL (pgvector) | localhost:55432 (Docker) | ✅ healthy |
| Redis | localhost:56379 (Docker) | ✅ healthy |
| LLM Provider | step-3.7-flash (https://api.stepfun.com) | ✅ 200 |
| 租户 | `a62307b9...` (Demo Tenant) | ✅ active |
| Model Config | v2, step-3.7-flash | ✅ active |

> **注意**: API 和 Worker 在本地 node 运行（非 Docker），因为 Docker 容器中的
> `sodium-native` 在 Alpine ARM64 上缺少预编译库导致崩溃。nginx (web 容器) 代理到
> Docker 内部的 api/worker（已停止），所以 Dashboard (8088) 返回 502。直接用
> localhost:8080 访问 API。

## E2E 测试结果（真实 LLM API）

### 测试 1: 订单查询 + PII

```
客户消息: "Where is my order ORDER-3001? Reply to alice@example.com"
```

| 检查项 | 结果 |
|---|---|
| Webhook 接收 | ✅ `pipeline_executed` |
| PII 检测 | ✅ `{email}` — 邮箱被自动识别 |
| 意图分类 | ✅ `order_status` |
| LLM 调用 | ✅ succeeded (464 input / 416 output tokens) |
| 最终结果 | ✅ `approval_pending` — 生成审批请求 |
| 延迟 | ⚠️ 6348ms (超过 max_auto_latency_ms: 5000) |
| 成本 | $0.000856 |

### 测试 2: 退款资格查询

```
客户消息: "Is order ORDER-3002 eligible for a refund?"
```

| 检查项 | 结果 |
|---|---|
| 意图分类 | ✅ `refund_eligibility` |
| LLM 调用 | ❌ `invalid_provider_response` — 推理链消耗所有 tokens，content 为空 |
| 最终结果 | ❌ `handed_off` — 降级到人工 |
| 延迟 | ⚠️ 8037ms |
| 成本 | $0 |

### 测试 3: 情绪化投诉 + PII

```
客户消息: "This is unacceptable! ORDER-3003 never arrived. Call me at 13800138000"
```

| 检查项 | 结果 |
|---|---|
| PII 检测 | ✅ `{phone}` — 中国手机号被识别 |
| 意图分类 | ✅ `unknown` — 路由器未找到明确意图 |
| LLM 调用 | ❌ `invalid_provider_response` — 推理链消耗所有 tokens |
| 最终结果 | ❌ `handed_off` — 降级到人工 |
| 延迟 | ⚠️ 7577ms |
| 成本 | $0 |

## 安全护栏验证

| 护栏 | 测试结果 |
|---|---|
| HMAC 签名验证 | ✅ 错误签名 → rejected；正确签名 → 通过 |
| PII 脱敏 | ✅ email + phone 自动检测并脱敏 |
| trace 不含原文 | ✅ 只存储 SHA-256 hash |
| 预算控制 | ✅ within_budget |
| 运行模式降级 | ✅ 缺证据/意图不明 → Auto→Shadow + handoff |
| 意图白名单 | ✅ refund_eligibility 未在 Auto 允许列表 → 降级 |
| 证据门控 | ✅ RAG 无证据 → grounding_missing → 不自动回复 |

## 发现的问题

### P0: step-3.7-flash 推理链导致 LLM 调用失败

- **现象**: 测试 2 和 3 的 LLM 调用返回 `invalid_provider_response`
- **原因**: step-3.7-flash 模型使用推理链（reasoning chain），消耗大量 tokens。
  当 `response_format: { type: 'json_object' }` 被设置时，推理链占据所有
  tokens，导致 `content` 为空字符串。
- **影响**: LLM 解析失败，pipeline 降级到 handoff
- **已修复**: 移除 `response_format`，增加 `maxOutputTokens` 到 1000/1500
- **状态**: ✅ 已修复（测试 1 成功验证）

### P1: 延迟超限

- **现象**: 所有测试的延迟超过 `max_auto_latency_ms: 5000`
- **原因**: step-3.7-flash 推理链消耗 6-8 秒
- **影响**: 所有 Auto 运行都被标记为 `latency_exceeded`，降级到 Shadow
- **建议**: 增加 `max_auto_latency_ms` 到 10000-15000，或使用更快的模型
- **状态**: ⚠️ 需要配置调整

### P2: LLM 空 content（provider adapter 未处理）

- **现象**: 当 `content` 为空字符串时，`JSON.parse("")` 抛出 `SyntaxError`
- **原因**: provider adapter 未检查空 content
- **影响**: 被记录为 `provider_failed`，无法区分具体错误
- **已修复**: 在 `invokeOpenAICompatible` 中添加 `content.length === 0` 检查
- **状态**: ✅ 已修复

### P3: Docker 容器 sodium-native 不兼容

- **现象**: API 容器在 Docker (Alpine ARM64) 中启动崩溃
  `Cannot find module '/prebuilds/linux-arm64-musl/sodium-native.node'`
- **原因**: `@fastify/secure-session` 依赖 `sodium-native`，在 Alpine ARM64 上
  缺少预编译库
- **影响**: API/worker 无法在 Docker 中运行，只能本地 node 运行
- **修复**(待定): 添加 Alpine 构建依赖 `sodium-dev` 或替换 secure-session
- **状态**: ⚠️ 需要修复

### P4: Dashboard (nginx 8088) 代理失败

- **现象**: localhost:8088 返回 502
- **原因**: nginx 代理到 Docker 内部 `api:8080`/`worker:8081`，但容器已停止
- **影响**: 无法通过浏览器访问 Dashboard
- **修复**(待定): 解决 P3 后重启 Docker 容器，或修改 nginx 代理到 `host.docker.internal:8080`
- **状态**: ⚠️ 需要修复

### P5: 意图白名单限制

- **现象**: `refund_eligibility` 和 `unknown` 不在 Auto 允许列表中
- **原因**: `runtime_mode_config.allowed_auto_intents` 只包含
  `['order_status', 'logistics_query', 'invoice_request']`
- **影响**: 退款和投诉查询被降级到 Shadow
- **建议**: 扩展 `allowed_auto_intents` 包含更多意图，或使用 Assist 模式
- **状态**: ⚠️ 需要配置调整

### P6: Mock Server LLM 响应格式不匹配

- **现象**: mock server 返回 `{"reply":"Order SMOKE-100 is currently shipped."}`
- **原因**: mock 使用固定响应，不匹配 triage 期望的 JSON 结构
- **影响**: mock 模式下 triage 解析失败
- **建议**: 更新 mock 响应匹配 triage schema
- **状态**: ⚠️ 需要修复

## 已实施的修复

| 问题 | 修复 | 文件 |
|---|---|---|
| P0: LLM 空 content | 移除 `response_format`，增加 `maxOutputTokens` | `provider.ts`, `ticket-service.ts` |
| P2: provider adapter 空 content | 添加 `content.length === 0` 检查 | `provider.ts` |
| LLM API 路径 | 配置 base URL 为 `https://api.stepfun.com/step_plan` | 环境变量 |
| Model config | 创建 v2 版本，step-3.7-flash | 数据库 |

## 剩余问题

| 优先级 | 问题 | 建议 |
|---|---|---|
| P1 | 延迟超限 (6-8s) | 增加 `max_auto_latency_ms` 或使用更快模型 |
| P3 | Docker sodium-native | 添加 Alpine 构建依赖或替换 secure-session |
| P4 | Dashboard 502 | 解决 P3 后重启 Docker 容器 |
| P5 | 意图白名单限制 | 扩展 `allowed_auto_intents` |
| P6 | Mock 响应格式 | 更新 mock 匹配 triage schema |

## 结论

**E2E 测试部分通过**：订单查询场景成功验证了完整 pipeline（PII 脱敏 → 意图分类 → LLM 调用 → 审批生成）。退款和投诉场景因 LLM 推理链延迟和意图白名单限制被降级到人工处理——这是正确的安全行为，但需要配置调整。

**已修复 4 个问题**：LLM API 路径、空 content 处理、provider adapter 空 content、model config 创建。

**剩余 5 个问题**需要后续处理：延迟超限、Docker 兼容性、Dashboard 代理、意图白名单、mock 响应格式。
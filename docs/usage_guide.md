# OpenSupport AgentOps 使用指南

## 架构概览

```
客户 (Chatwoot Widget)
    ↓ webhook
AgentOps API (8080)
    ├── 验签 → 去重 → 归一化 → PII 脱敏
    ├── Code Router (意图识别)
    ├── Triage Agent (LLM 调用)  ← 连接外部 LLM API
    ├── RAG 检索 (策略文档)
    ├── Tool Executor (订单/物流/退款查询)
    ├── Guardrails (风险门禁)
    ├── Response Agent (LLM 生成回复)  ← 连接外部 LLM API
    └── Chatwoot 投递  ← 连接外部 Chatwoot 实例
```

## 一、连接真实 LLM API（OpenAI / Anthropic）

### 1. 配置环境变量

编辑 `.env`（本地开发）或 `.env.production`（Docker 部署）：

```bash
# LLM Provider 端点（OpenAI/Anthropic 有默认值，兼容厂商需显式指定）
AGENTOPS_PROVIDER_BASE_URLS_JSON={"openai":"https://api.openai.com","anthropic":"https://api.anthropic.com"}

# 模型定价（用于成本治理，单位：美元/百万 token）
AGENTOPS_MODEL_PRICING_JSON={"gpt-4.1-mini":{"inputCostPerMillion":0.4,"outputCostPerMillion":1.6},"gpt-4.1":{"inputCostPerMillion":2.5,"outputCostPerMillion":10}}
```

### 2. 通过 API 设置租户模型配置（BYOK）

API Key 不是直接写在环境变量里，而是通过 **信封加密** 存入数据库：

```bash
# 1. 登录获取 session cookie（省略 OIDC 流程）

# 2. 调用 API 更新租户的模型配置
curl -X PUT http://localhost:8080/api/v1/tenants/{tenantId}/settings/model-config \
  -H "Content-Type: application/json" \
  -H "Cookie: <session-cookie>" \
  -d '{
    "provider": "openai",
    "fast_model": "gpt-4.1-mini",
    "strong_model": "gpt-4.1",
    "embedding_model": "text-embedding-3-small",
    "fallback_model": "gpt-4.1-mini",
    "timeout_ms": 10000,
    "max_cost_per_ticket": 0.02,
    "daily_budget": 5.0,
    "budget_currency": "USD",
    "replacement_api_key": "sk-你的真实API Key",
    "confirm": true
  }'
```

**发生了什么**：
- API Key 用 AES-256-GCM 信封加密后存入 `tenant_model_configs.encrypted_api_key_ref`
- 数据库中永远不存明文 key
- 运行时调用 LLM 前才解密，用后立即清零

### 3. 支持的 Provider

| Provider | base_url 默认值 | 认证方式 |
|---|---|---|
| `openai` | `https://api.openai.com` | `Authorization: Bearer sk-...` |
| `anthropic` | `https://api.anthropic.com` | `x-api-key: sk-ant-...` |
| 其他兼容厂商 | 需在 `AGENTOPS_PROVIDER_BASE_URLS_JSON` 中指定 | 走 OpenAI 兼容协议 |

### 4. 成本治理机制

```text
每次 LLM 调用前：
  估算成本 = 输入 token × 输入单价 + 输出 token × 输出单价
  if (工单累计成本 > max_cost_per_ticket) → 降级到 Assist/Shadow
  if (当日累计成本 > daily_budget) → 降级到 Shadow 或转人工
```

## 二、连接真实 Chatwoot 实例

### 1. 部署 Chatwoot

```bash
# 使用官方 Docker 镜像部署 Chatwoot
# 参考文档：https://www.chatwoot.com/docs/self-hosted/deployment/docker
```

### 2. 在 Chatwoot 中创建 Agent Bot

在 Chatwoot 管理后台：
1. 设置 → Agent Bots → 创建新 Agent Bot
2. 设置 `outgoing_url` 为：`http://你的AgentOps地址:8080/api/v1/chatwoot/agent-bot/{tenantId}`
3. 记录生成的 API Token

### 3. 创建 Account Webhook

在 Chatwoot 管理后台：
1. 设置 → Webhooks → 创建 Webhook
2. URL 设为：`http://你的AgentOps地址:8080/api/v1/chatwoot/webhooks/{tenantId}`
3. 订阅 `message_created` 事件
4. 记录 Webhook Secret

### 4. 在 AgentOps 中配置 Chatwoot 连接

```bash
curl -X PUT http://localhost:8080/api/v1/tenants/{tenantId}/settings/chatwoot \
  -H "Content-Type: application/json" \
  -H "Cookie: <session-cookie>" \
  -d '{
    "base_url": "http://你的Chatwoot地址:3000",
    "account_id": 1,
    "inbox_id": 1,
    "agent_bot_id": 1,
    "runtime_mode": "shadow",
    "webhook_secret_ref": "env:CHATWOOT_WEBHOOK_SECRET",
    "api_token_ref": "env:CHATWOOT_API_TOKEN",
    "confirm": true
  }'
```

**密钥引用格式**：`env:环境变量名`，实际密钥值放在环境变量中：
```bash
CHATWOOT_WEBHOOK_SECRET=你的webhook密钥
CHATWOOT_API_TOKEN=你的agent-bot-token
```

### 5. 消息流转

```
客户在 Chatwoot Widget 发消息
  → Chatwoot 发送 webhook 到 AgentOps
  → AgentOps 验签 + 处理
  → AgentOps 通过 Chatwoot Messages API 发送回复
  → 客户在 Widget 看到回复
```

## 三、三种运行模式

| 模式 | 行为 | 适用场景 |
|---|---|---|
| **Shadow** | 只写 private note，不回复客户 | 新版本验证、影子测试 |
| **Assist** | 生成建议，创建审批请求，人工确认后回复 | 中风险场景、退款投诉 |
| **Auto** | 低风险 + 有证据 + 有工具结果时自动回复 | 物流查询、订单状态 |

切换模式（通过 API 或界面）：
```bash
curl -X PUT http://localhost:8080/api/v1/tenants/{tenantId}/settings/chatwoot \
  -d '{"runtime_mode": "auto", ...}'
```

## 四、完整启动流程（本地开发）

### Step 1: 启动基础设施

```bash
# 启动 PostgreSQL (pgvector) + Redis
npm run db:up

# 执行数据库迁移
npm run db:migrate
```

### Step 2: 配置环境变量

```bash
cp .env.example .env

# 编辑 .env，填入：
# - AGENTOPS_MASTER_KEY（生成：openssl rand 32 | base64 | sed 's/^/base64url:/')
# - AGENTOPS_OIDC_* （你的 OIDC 提供商配置）
# - AGENTOPS_PROVIDER_BASE_URLS_JSON（LLM 端点）
# - AGENTOPS_MODEL_PRICING_JSON（模型定价）
```

### Step 3: 生成密钥文件

```bash
# 主密钥（32 字节，base64url 编码）
openssl rand 32 | base64 | tr -d '=' | tr '+/' '-_' | sed 's/^/base64url:/' > secrets/agentops_master_key

# Session 签名密钥（32 字节随机）
openssl rand 32 > secrets/agentops_operator_session_key
```

### Step 4: 启动服务

```bash
# 编译
npm run build

# 启动 API（终端 1）
npm run start:api

# 启动 Worker（终端 2）
npm run start:worker

# 启动前端（终端 3）
npm run dev:web
```

### Step 5: 创建租户并配置

通过界面（http://localhost:5173）或 API：
1. 创建租户
2. 配置 Chatwoot 连接（base_url + webhook secret + api token）
3. 配置模型（provider + model names + api key + budget）
4. 上传策略文档（用于 RAG）
5. 选择运行模式（Shadow → Assist → Auto 逐步灰度）

### Step 6: 发送测试消息

```bash
# 用 live-smoke 脚本发送真实签名消息
AGENTOPS_API_URL=http://localhost:8080 \
AGENTOPS_SMOKE_TENANT_ID=<你的租户UUID> \
AGENTOPS_SMOKE_CONVERSATION_ID=1 \
AGENTOPS_SMOKE_CONTACT_ID=1 \
AGENTOPS_SMOKE_MESSAGE="订单 SMOKE-100 的状态是什么？" \
CHATWOOT_WEBHOOK_SECRET=<你的webhook密钥> \
npm run smoke:live
```

## 五、当前 Demo 环境说明

当前 demo 使用 **mock server** 模拟了所有外部依赖：

| 外部服务 | Demo 替代 | 真实环境 |
|---|---|---|
| LLM API | mock server (18090) 返回固定回复 | OpenAI / Anthropic API |
| Chatwoot | mock server 接收消息但不投递给真实客户 | 真实 Chatwoot 实例 |
| OIDC | mock server 自动登录 | Keycloak / Auth0 / 其他 OIDC |

**切换到真实 API 只需**：
1. 修改 `AGENTOPS_PROVIDER_BASE_URLS_JSON` 指向真实端点
2. 修改 `AGENTOPS_MODEL_PRICING_JSON` 填入真实模型定价
3. 通过 API 设置租户模型配置时填入真实 API Key
4. 配置 Chatwoot 连接指向真实 Chatwoot 实例

AgentOps 代码不需要任何改动——provider adapter 和 chatwoot connector 都是通过配置驱动的。

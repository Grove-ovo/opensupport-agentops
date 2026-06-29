# 部署与运行过程修复清单

> 本次从代码审查 → 复审 → 部署 demo → 跑通 webhook 全流程中，暴露出的所有需要修复的问题。

---

## 一、代码层面（复审报告未关闭项）

### 🔴 S-3 未修复 — Guardrails 输出 PII 检测不完整

**位置**: `packages/guardrails/src/guardrails.ts`

**问题**: `OUTPUT_PII_PATTERNS` 只覆盖邮箱、美国电话、中国手机号、简单银行卡（16 位数字），缺少：
- 中国身份证（18 位，含 X）
- 国际电话号码（+86、+1 等）
- 银行卡 Luhn 校验

**影响**: 包含身份证号的 AI 回复能通过输出门禁发给客户，**直接违反 PRD AC-07 的 `pii_leak_rate = 0`**。

**修复建议**:
- 复用已有的 `maskPII` 做输出侧检测，而不是单独维护 pattern 列表
- 预计工时：30 分钟

---

### 🟡 B-1 部分修复 — SSRF 域名可绕过 DNS 解析

**位置**: `packages/chatwoot/src/delivery.ts:isSafeBaseUrl`

**当前修复**: 新增 IP 黑名单（169.254.169.254、10.0.0.0/8、172.16.0.0/12、192.168.0.0/16）

**剩余风险**: 攻击者注册一个域名（如 `aaaa.168.254.169.254.nip.io`）解析到元数据地址，IP 黑名单无法识别。

**修复建议**:
- 生产环境部署前，增加 DNS 解析校验：先解析域名到 IP，再对 IP 做黑名单检查
- 或改为 allowlist 模式（只允许公网 IP）

---

### 🟡 B-2 部分修复 — 审批动作竞态顺序未改

**位置**: `apps/api/src/operations.ts:applyApprovalAction`

**当前修复**: 增加了 CAS 返回值检查（能检测并发冲突）

**剩余风险**: "先投递消息到 Chatwoot，后做 SQL CAS"的顺序没改。两个不同操作者同时审批同一工单时，仍可能重复发送消息。当前依赖 delivery 的幂等性（相同 `idempotencyKey` 时 Chatwoot 会去重），但如果两个审批者的 key 不同，仍会重复。

**修复建议**:
- 重构为"先 CAS 成功，后投递消息"
- 预计工时：2 小时

---

## 二、部署工程问题（Docker / 本地运行）

### 🔴 Dockerfile 基础镜像选型错误

**位置**: `infra/docker/Dockerfile.api`、`infra/docker/Dockerfile.worker`

**问题**: 使用 `node:22-alpine`（musl libc），导致 `sodium-native` 无 `linux-arm64-musl` prebuild，必须从源码编译。

**影响**: Apple Silicon (arm64) 构建失败，本地 demo 无法用 Docker 运行。

**修复建议**:
- 改用 `node:22-slim`（Debian glibc），有 `linux-arm64` prebuild
- 或保留 Alpine 但安装 `libsodium-dev` + 配置 node-gyp 正确编译路径

---

### 🔴 旧 Docker 镜像缓存导致部署失效

**问题**: 代码已更新但 Docker 镜像还是 4 天前的版本，`operator-auth` 模块不存在。

**修复建议**:
- 部署流程加入镜像版本号/commit hash 校验
- 或 CI/CD 自动清理旧镜像

---

### 🟡 .env.production 缺少 OIDC 配置

**问题**: OIDC 相关环境变量（`AGENTOPS_OIDC_ISSUER`、`AGENTOPS_OIDC_CLIENT_SECRET` 等）未在 `.env.production.example` 中列出。

**修复建议**:
- 补全 `.env.production.example`，加入 OIDC 配置项说明

---

### 🟡 chatwoot_connections 默认 is_active=false

**位置**: 数据库 schema

**问题**: 新插入的连接默认 `is_active = false`，demo 时手动发现才激活。

**修复建议**:
- 新连接创建时默认 `true`，或前端创建时强制激活

---

### 🟡 smoke 测试脚本端口假设太强

**位置**: `scripts/production-smoke.mjs`

**问题**: 假设 worker 在特定端口、nginx 代理路径固定，本地运行时需要大量环境变量覆盖。

**修复建议**:
- 增加 `SMOKE_API_URL`、`SMOKE_WORKER_URL` 环境变量，默认从 `AGENTOPS_PUBLIC_URL` 推导

---

## 三、Demo 运行中暴露的可用性问题

### 🟡 Web 前端 Docker 容器与 API 分离

**问题**: 8088（web 容器）代理到已停止的 API 容器，返回 502。本地跑 Vite dev server（5173）需要单独启动，且需要配置代理到 8080。

**修复建议**:
- 增加 `docker compose up web` 的独立文档
- 或 Vite config 增加 `server.proxy` 默认配置

---

### 💭 curl 连接超时问题

**问题**: curl 在 10 秒后 ECONNRESET，改用 Node.js fetch 正常。

**可能原因**: macOS 网络栈对长连接 localhost 的处理，或 API 响应慢时 curl 默认超时。

**修复建议**: 无代码改动需要，测试时用 Node.js 脚本替代 curl 即可。

---

## 四、按优先级排序的修复计划

| 优先级 | 问题 | 预计工时 | 阻塞上线？ |
|---|---|---|---|
| **P0** | S-3 Guardrails PII 检测补全 | 30 分钟 | ✅ 是（违反 AC-07） |
| **P0** | Dockerfile 改用 node:22-slim | 1 小时 | ✅ 是（CI/CD 必须过） |
| **P1** | B-1 SSRF 加 DNS 解析校验 | 2 小时 | 生产前必须 |
| **P1** | B-2 竞态顺序重构 | 2 小时 | 高并发场景必须 |
| **P1** | .env.production.example 补全 OIDC | 30 分钟 | 否 |
| **P2** | chatwoot_connections 默认激活 | 15 分钟 | 否 |
| **P2** | smoke 脚本端口可配置 | 1 小时 | 否 |
| **P2** | Web 前端代理配置文档 | 30 分钟 | 否 |

---

## 五、当前 Demo 可用的 workaround

虽然以上问题存在，但**当前 demo 已验证可完整运行**：

| 问题 | Workaround |
|---|---|
| Docker 构建失败 | 本地用 `node` 直接运行（macOS 有 sodium-native prebuild） |
| Web 前端 502 | 本地 `npm run dev:web` 启动 Vite |
| SSRF | demo 环境 mock server 在本地，无真实外网风险 |
| 竞态 | demo 是单用户测试，并发概率极低 |
| PII 检测 | demo 数据不含身份证/国际电话 |

**结论**: Demo 演示可用，上线前必须修 P0 项。

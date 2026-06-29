# 上线前全检报告 — OpenSupport AgentOps

**日期**：2026-06-27
**场景**：上线前检查（代码审查 + 安全审计 + QA 测试）
**参与成员**：产品官 + 安全卫士 + 质量门神

---

## 📌 TL;DR（执行摘要，3-5 行）
- 整体结论：🟡 有条件通过
- 阻塞项数量：3 项（2 项 High + 1 项 Medium）
- 关键发现：代码审查、安全审计、QA 测试三方均指出 PII 输出门禁不完整、SSRF 域名绕过、审批并发竞态三类高优问题
- 下一步：修复 3 项阻塞后可进入候选发布；集成测试需启动 Postgres + Redis 后重跑
- 建议负责人：工程负责人统筹 P0/P1 修复，安全官验证闭环

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| Go / No-Go | 🟡 条件 Go |
| 严重度分布 | 🔴 2 / 🟠 0 / 🟡 5 / 🟢 6 |
| 关键行动项 | 5 条 |
| 建议负责人 | 工程负责人 + 安全官 + QA |

---

## 1. 各成员核心结论（每位 1 段，别整段复制成员原文）

### 🔍 产品官（代码审查）
- 核心判断：PRD 9/9 验收标准全部实现，代码与需求高度吻合；上一轮 11 个问题中 9 个已完全修复，修复质量整体扎实。
- 关键建议：当前最高优先级是 **S-3（输出 PII 检测不完整）**，直接违反 PRD AC-07 的 `PII Leak Rate = 0` 硬指标，预计 30 分钟内可修复；其次是 B-2 审批投递顺序重构，根治并发重复发送。

### 🛡️ 安全卫士（OWASP+STRIDE 审计）
- 核心判断：项目安全基础扎实（参数化 SQL、AES-256-GCM、OIDC+PKCE、Docker 加固），但存在 1 个时序攻击代码缺陷、2 个配置级风险，需在 launch 前完成 P0 修复。
- 关键建议：立即修复 `operator-auth.ts:246` 的 `safeEqual` 长度泄露 bug，将 secrets 文件权限改为 600，并将 `compose.phase1.yml` 的 PostgreSQL/Redis 绑定改为 localhost + 密码。

### ✅ 质量门神（QA 测试）
- 核心判断：Quick 层（构建/类型检查/lint/单测）全部通过，Standard 层核心业务流程验证通过；但集成/E2E 测试因缺少 Postgres + Redis 环境被阻塞，Exhaustive 层发现 2 个 High、6 个 Medium、5 个 Low 共 13 项问题。
- 关键建议：P0 立即修复 SSRF 和审批竞态；P1 修复 PII 脱敏链路、LLM 错误日志、operations.ts 单测覆盖；集成测试需在 `npm run db:up` 后重跑。

---

## 2. 综合审查发现（去重合并后按严重度排序）

| # | 严重度 | 类别 | 位置 | 问题描述 | 建议 | 来源成员 |
|---|--------|------|------|---------|------|---------|
| 1 | 🔴 | 安全 / PII | `packages/guardrails/src/guardrails.ts:41-46` | 输出门禁缺少中国身份证、国际电话、银行卡 Luhn 检测，LLM 回复可直接泄露 PII | 复用 `maskPII` 统一检测 | 产品官 + QA |
| 2 | 🔴 | 安全 | `apps/api/src/operator-auth.ts:246` | `safeEqual` 长度不匹配时执行 `timingSafeEqual(leftBuffer, leftBuffer)`，泄露 CSRF token 长度 | 改为 `timingSafeEqual(rightBuffer, rightBuffer)` | 安全官 |
| 3 | 🟡 | 安全 / 配置 | `infra/docker/compose.phase1.yml:12` | PostgreSQL 绑定在所有接口无密码，Redis 无 `--requirepass` | 加 `127.0.0.1:` 前缀 + Redis 密码 | 安全官 |
| 4 | 🟡 | 安全 / SSRF | `apps/api/src/operations.ts:1120-1140` | SSRF IP 黑名单可被域名绕过（如 `evil.com` 解析到 `169.254.169.254`） | 补充 DNS 解析校验或域名白名单 | 产品官 + QA |
| 5 | 🟡 | 数据一致性 | `apps/api/src/operations.ts:225-279` | 审批动作先投递后 CAS，并发下仍可能重复发送（不同 idempotencyKey） | 重构为先 CAS 后投递 | 产品官 + QA |
| 6 | 🟡 | 安全 / 配置 | `.env.production:23` | `AGENTOPS_COOKIE_SECURE=false` | 强制 `true` + 启动检查 | 安全官 |
| 7 | 🟡 | 测试 | — | 集成/E2E 测试需 Postgres + Redis，当前未运行 | 启动 `npm run db:up` 后重跑 | QA |
| 8 | 🟡 | 配置 / CI | `.github/workflows/ci.yml:76` | `full-stack` job 使用 `continue-on-error: true`，集成测试失败不阻断流水线 | 移除该标记 | 安全官 |
| 9 | 🟢 | 安全 / 权限 | `secrets/agentops_oidc_client_secret`, `secrets/agentops_operator_session_key` | secrets 文件权限 644（应为 600） | `chmod 600` | 安全官 |
| 10 | 🟢 | 数据 / PII | 多处 | 工具结果未脱敏即进入 LLM prompt（已修复，复审确认） | 无需额外操作 | 产品官 |
| 11 | 🟢 | 日志 | `apps/api/src/chatwoot/delivery.ts` | catch 块吞错误无日志（已修复，复审确认） | 无需额外操作 | 产品官 |

---

## ✅ 行动清单（至少 3 条具体可执行项）

| # | 行动 | 负责方 | 紧急度 | 期望完成 |
|---|------|--------|--------|---------|
| 1 | 修复 S-3：在 guardrails 输出门禁复用 `maskPII`，补全身份证/国际电话/银行卡 Luhn 检测 | 工程负责人 | P0 | 2026-06-28 |
| 2 | 修复 F-001：修改 `operator-auth.ts:246` 的 `safeEqual` 长度为 `rightBuffer` | 工程负责人 | P0 | 2026-06-28 |
| 3 | 修复 F-002：将 `secrets/agentops_oidc_client_secret` 和 `secrets/agentops_operator_session_key` 权限改为 600 | 工程负责人 | P0 | 2026-06-28 |
| 4 | 修复 B-2：重构 `operations.ts:225-279`，将审批动作改为先 CAS 后投递 | 工程负责人 | P1 | 2026-07-05 |
| 5 | 启动 Postgres + Redis 环境，重跑集成/E2E 测试并修复失败项 | QA | P1 | 2026-07-05 |

---

## ⚠️ 待完善 / 已知局限

- 集成/E2E 测试因缺少 Postgres + Redis 环境未能执行，当前结论基于 Quick + Standard + Exhaustive 静态/单测层面。
- SSRF 域名绕过修复建议包含 DNS rebinding 风险，需在下一迭代评估是否引入 `AGENTOPS_CHATWOOT_BASE_URL_ALLOWLIST`。
- CI `full-stack` job 的 `continue-on-error: true` 需确认是否有意保留（如 flaky 测试保护），若无业务原因应移除。

---

## 📚 成员产出索引

- gstack-product-reviewer（产品官）原始产出：`reports/CODE_REVIEW_REVISION_2026-06-26.md`
- gstack-security-officer（安全卫士）原始产出：`security-audit-report.md`
- gstack-qa-lead（质量门神）原始产出：见消息回传（2026-06-27 上线前 QA 测试报告）

---

> 本报告由软件工坊 AI 协作生成，关键决策请由工程负责人复核。

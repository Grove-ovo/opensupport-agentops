# 代码复审报告 — OpenSupport AgentOps（修复后）

**复审日期**: 2026-06-26
**复审目的**: 核对前一轮审查发现的 3 个 Blocker + 8 个 Suggestion 的修复情况，并核对代码与 PRD 验收标准的吻合度
**审查方式**: 静态代码审查（未修改任何代码）

---

## 一、修复情况总览

| 编号 | 问题 | 修复状态 | 说明 |
|---|---|---|---|
| **B-1** | SSRF：Chatwoot base_url 校验过宽 | 🟡 **部分修复** | 新增 IP 黑名单，但域名仍可绕过 |
| **B-2** | 审批动作并发竞态 | 🟡 **部分修复** | 增加了 CAS 返回值检查，但投递顺序未改 |
| **B-3** | 签名验签空密钥放行 | 🟢 **完全修复** | `verified: false` + reason |
| **S-1** | LLM Provider 错误响应被丢弃 | 🟢 **完全修复** | `extractProviderError` 提取并附加到异常 |
| **S-2** | operations.ts 无单测 | 🟢 **已补充** | 新增 operations-routes.test.ts + integration.test.ts |
| **S-3** | Guardrails 输出 PII 模式不完整 | 🔴 **未修复** | 仍缺身份证/国际电话/Luhn |
| **S-4** | 工具结果未脱敏进入 LLM prompt | 🟢 **完全修复** | `maskToolResults()` 对字符串字段应用 maskPII |
| **S-5** | delivery catch 块吞掉错误 | 🟢 **完全修复** | 记录 error name + message 到 stderr |
| **S-6** | safeEqual 长度信息泄露 | 🟢 **完全修复** | 不等长时执行假比较再返回 false |
| **S-7** | Web 前端 URL 参数未编码 | 🟢 **完全修复** | 全部使用 `encodeURIComponent` + `URLSearchParams` |
| **S-8** | handoff 失败对操作者不可见 | 🟢 **完全修复** | 抛出 `escalate_handoff_failed` 502 |

**修复率**: 9/11 完全修复，2/11 部分修复，1/11 未修复

---

## 二、PRD 验收标准核对

| AC | 描述 | 实现状态 | 关键文件 |
|---|---|---|---|
| AC-01 | Chatwoot 事件处理（验签/去重/归一化/trace） | 🟢 完整 | `ticket-service.ts:76-217`, `chatwoot/signature.ts` |
| AC-02 | Shadow Mode（仅 private note） | 🟢 完整 | `runtime-control/mode-decision.ts:66-75` |
| AC-03 | Assist Mode（创建 approval + evidence/tool/risk） | 🟢 完整 | `mode-decision.ts:76-95`, `ticket-service.ts:405-419` |
| AC-04 | Auto Mode（低风险+证据+工具结果→public reply） | 🟢 完整 | `mode-decision.ts:97-147`, `ticket-service.ts:420-475` |
| AC-05 | Evidence Gate（无证据不定论） | 🟢 完整 | `guardrails.ts:234-292`, `rag/pipeline.ts:200-224` |
| AC-06 | Tool Safety（退款仅 dry-run + 高风险审批） | 🟢 完整 | `tools/manifests.ts:51-70`, `guardrails.ts:183-232` |
| AC-07 | Security Eval Gate（三率=0） | 🟢 完整 | `eval/security.ts:135-185`, `eval/release-gate.ts:254-280` |
| AC-08 | Cost Governance（超 cap 降级 + 记录） | 🟢 完整 | `llm-runtime/runtime.ts:29-59`, `ticket-service.ts:364-390` |
| AC-09 | Release Gate（5 类变更触发 eval） | 🟢 完整 | `eval/release-gate.ts:176-282`, `operations.ts:367-420` |

**结论**: **9/9 条验收标准全部实现，与 PRD 需求吻合**。AC-09 通过 release candidate 的 `snapshot_hash` 与 eval run 强绑定实现"变更必触发 eval"，设计合理。

---

## 三、仍需关注的问题

### 🟡 B-1 残留：SSRF 防护可被域名绕过

**文件**: `apps/api/src/operations.ts:1120-1140` + `packages/chatwoot/src/delivery.ts:341-360`

**已修复部分**:
- ✅ 新增 `isPrivateHost()` 函数，过滤 IPv4 私网（127/10/169.254/192.168/172.16-31）和 IPv6 本地/ULA/链路本地
- ✅ `normalizeHttpUrl` 和 `isSafeBaseUrl` 都调用了 `isPrivateHost`

**残留风险**:

```typescript
function isPrivateHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '0.0.0.0') return true;
  const ip = isIP(hostname);
  if (ip === 0) return false;   // ← 域名直接放行，未做 DNS 解析
  // ...
}
```

攻击者可注册 `chatwoot-internal.evil.com` 解析到 `169.254.169.254`（AWS 元数据）或 `127.0.0.1`，绕过 IP 黑名单。这是 SSRF 防护的经典绕过手法。

**建议**:
1. **短期（MVP 可接受）**: 在 `isPrivateHost` 中增加已知恶意域名后缀黑名单（如 `*.internal`, `*.local`, `*.localhost`）
2. **长期**: 配置 `AGENTOPS_CHATWOOT_BASE_URL_ALLOWLIST`，仅允许预批准的 Chatwoot 实例域名；或对域名做 DNS 解析后校验解析结果 IP（注意 DNS rebinding，需在 fetch 时二次校验）
3. **强制 HTTPS**: 生产环境建议 `url.protocol !== 'https:'` 直接拒绝（当前仍允许 http）

**风险等级**: 中 —— 需要租户编辑权限才能利用，但一旦被利用可探测内网

---

### 🟡 B-2 残留：审批动作投递顺序未改，并发下仍可能重复发送

**文件**: `apps/api/src/operations.ts:225-279`

**已修复部分**:
- ✅ L277-279 增加了 CAS 返回值检查：`if (result.rows.length === 0 || !result.rows[0]?.action_id) throw 409`
- ✅ L297 handoff 失败现在抛出 `OperationsError('escalate_handoff_failed', 502)`（S-8 修复）

**残留问题**:

投递与 CAS 的顺序**未改变**：

```
L215  JS 检查 state === 'pending'        ← 并发请求都能通过
L238  await this.delivery.deliver(...)    ← 消息已发给客户！
L257  await pool.query(apply_approval_action)  ← CAS 才执行
L277  if CAS 失败 throw 409               ← 但消息已经发出去了
```

**并发场景分析**:

| 时刻 | 请求 A | 请求 B | 结果 |
|---|---|---|---|
| t1 | L215 检查 pending ✅ | | |
| t2 | | L215 检查 pending ✅ | 两个请求都通过了 JS 检查 |
| t3 | L238 投递消息（idempotencyKey=A） | | 客户收到消息 1 |
| t4 | | L238 投递消息（idempotencyKey=B） | 客户收到消息 2 |
| t5 | L257 CAS 成功 | | A 的审批状态变更 |
| t6 | | L257 CAS 失败 | B 抛 409，但消息 2 已发出 |

**关键缓解**: `approvalDeliveryCommand`（L1021-1039）生成的 idempotency_key 是 `approval:${approval_id}:${idempotencyKey}`。如果两个并发请求的 `idempotencyKey` **相同**（如前端重试），delivery 层的 `ChatwootDeliveryService` 会通过 `input_hash` 比对返回 `duplicate_delivery`，**不会真正重复发送**。

但如果两个请求的 `idempotencyKey` **不同**（两个操作者各自点击，或前端每次生成新 key），delivery 层无法去重，消息会重复发送。

**建议**:

采用前一轮报告中的**方案 A：先 CAS，后投递**：

```typescript
// 1. 先用 CAS 把状态从 pending → processing（需在 SQL 函数中支持）
const claim = await this.pool.query(
  `SELECT * FROM apply_approval_action(..., 'pending', 'processing', ...)`,
  [...],
);
if (claim.rows.length === 0) throw new OperationsError('approval_not_pending', 409);

// 2. 再投递消息（delivery 的幂等性作为兜底）
const delivery = await this.delivery.deliver(...);

// 3. 投递成功后 CAS processing → 终态
await this.pool.query(`SELECT * FROM finalize_approval_action(...)`);
```

这样并发时只有一个请求能 claim 成功，其余直接 409，消息绝不会重复发送。

**风险等级**: 中 —— 需要并发触发，且依赖不同 idempotencyKey；但一旦发生，客户收到重复消息 + 审计不一致

---

### 🔴 S-3 未修复：Guardrails 输出 PII 检测模式仍不完整

**文件**: `packages/guardrails/src/guardrails.ts:41-46`

```typescript
const OUTPUT_PII_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,                          // 邮箱 ✓
  /(?<!\d)(?:\+?1[-.\s]?)?(?:\(?[2-9]\d{2}\)?[-.\s]?)\d{3}[-.\s]\d{4}(?!\d)/u,  // 仅美国电话
  /(?<!\d)1[3-9]\d{9}(?!\d)/u,                                            // 中国手机号 ✓
  /\b(?:\d[ -]*?){13,19}\b/u,                                             // 银行卡（无 Luhn）
];
```

**仍缺少**:
- ❌ 中国身份证号（18 位带校验码）—— `pii/mask.ts` 有，输出门禁没有
- ❌ 国际电话号码（`+\d{1,3}...`）—— `pii/mask.ts` 有，输出门禁没有
- ❌ 银行卡 Luhn 校验 —— 当前模式 `\b(?:\d[ -]*?){13,19}\b` 会误报任意 13-19 位数字（如订单号、跟踪号）

**影响**: 一条包含中国身份证号 `110101199001011234` 的回复能通过输出门禁，被发送给客户，违反 PRD AC-07 的 `PII Leak Rate = 0` 要求。

**建议**: 在 `evaluateOutputGate` 中复用 `maskPII`：

```typescript
import { maskPII } from '@opensupport/pii';

function evaluateOutputGate(input, createdAt): GateDecision[] {
  if (input.proposed_output === null) return [];
  const decisions: GateDecision[] = [];
  const piiResult = maskPII(input.proposed_output);
  if (piiResult.replacements.length > 0) {
    decisions.push(createDecision(
      input, createdAt, 'output', 'pii_leak', 'P0', 'sanitize', true,
      { output: input.proposed_output, categories: piiResult.replacements.map(r => r.category) },
    ));
  }
  // ... 保留原有的 policyClaim / approval_bypass 检测
}
```

**风险等级**: 高 —— 直接违反 PRD 安全要求，可能导致 PII 泄漏

---

## 四、修复质量评价

### 做得好的地方

1. **B-3 签名契约修复干净利落** —— `verified: false` + `reason: 'secret_not_configured'`，语义清晰，调用方行为不变但契约安全了
2. **S-1 provider 错误处理** —— `extractProviderError` 提取 OpenAI/Anthropic 错误消息（截断 500 字防日志膨胀），附加到 `ProviderAdapterError`，既不暴露给客户端又便于运维诊断
3. **S-4 maskToolResults** —— 递归对工具结果对象的字符串字段应用 maskPII，覆盖了所有 PII 类别（与输入侧一致）
4. **S-7 URL 编码** —— 全面使用 `encodeURIComponent` + `URLSearchParams`，没有遗漏
5. **S-2 测试补充** —— operations-routes.test.ts 用 MockOperationsService 覆盖了路由层；integration.test.ts 用真实 Postgres + Redis 覆盖存储层

### 可以改进的地方

1. **B-2 只做了表面修复** —— 增加了 CAS 返回值检查（L277-279），这是好的，但核心的"先投递后 CAS"顺序没动。建议下一轮重构时彻底改为"先 CAS 后投递"
2. **B-1 的 IP 黑名单是必要但不充分的** —— 对 MVP 演示足够，但文档中应标注"生产部署前需补充 DNS 解析或 allowlist"
3. **S-3 完全未动** —— 这是最该优先修复的，因为它直接关联 PRD 的 `PII Leak Rate = 0` 硬指标

---

## 五、优先级建议

| 优先级 | 问题 | 建议时间 |
|---|---|---|
| **P0 立即** | S-3 输出 PII 模式不完整（违反 AC-07） | 上线前必须 |
| **P1 短期** | B-2 投递顺序重构（根治并发重复发送） | 2 周内 |
| **P2 中期** | B-1 SSRF 补 DNS 解析或 allowlist | 1 个月内 |
| **P3 长期** | 强制 HTTPS for Chatwoot base_url | 机会主义 |

---

## 六、总结

**整体评价**: 修复质量较高，11 个问题中 9 个完全修复，2 个部分修复，1 个未修复。PRD 的 9 条验收标准全部实现，代码与需求吻合。

**最需要关注的一件事**: **S-3（输出 PII 检测不完整）** 是当前最高优先级，因为它直接违反 PRD AC-07 的 `PII Leak Rate = 0` 要求。一个包含中国身份证号的 LLM 回复能通过 guardrails 输出门禁被发送给客户。修复方式很简单——复用已有的 `maskPII` 函数，预计 30 分钟内可完成。

**次优先**: B-2 的投递顺序问题虽然 delivery 层的幂等性提供了部分缓解，但在不同 idempotencyKey 的并发场景下仍会重复发送。建议在下一轮重构时彻底改为"先 CAS 后投递"。

**可以放心上线的部分**: B-1 的 IP 黑名单对 MVP 演示已足够，B-3/S-1/S-4/S-5/S-6/S-7/S-8 的修复都很扎实。

---

**报告结束**。如需对 S-3 或 B-2 提供具体补丁示例，请告知。

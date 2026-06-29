# 代码审查报告 — OpenSupport AgentOps

**审查日期**: 2026-06-26
**审查范围**: `apps/` (api、worker、web) + `packages/` (17 个内部包)
**审查重点**: 正确性、安全性、可维护性、性能、测试覆盖
**审查方式**: 静态代码审查（未运行测试，未修改任何代码）

---

## 一、总体评价

### 整体印象

这是一个**工程化程度相当高**的项目。安全设计上有明显的深思熟虑：信封加密、HMAC 时序安全签名、参数化 SQL、JSON Schema 严格校验、租户隔离、PII 脱敏、四道 guardrails 门禁。这些在同类项目中并不常见，值得肯定。

但仍有 **3 个阻塞性问题** 和若干改进点，主要集中在：

1. **SSRF 防护缺失** —— Chatwoot `base_url` 校验过宽
2. **审批动作的并发竞态** —— 消息可能重复发送且状态不一致
3. **核心业务代码测试覆盖不足** —— 1185 行 `operations.ts` 无单测

### 量化概览

| 维度 | 评分 | 说明 |
|---|---|---|
| 正确性 | 🟡 7/10 | 主流程正确，但存在并发竞态 |
| 安全性 | 🟡 7/10 | 加密/签名/校验扎实，但 SSRF 是明显短板 |
| 可维护性 | 🟢 8/10 | 模块化清晰，命名规范，部分大文件需拆分 |
| 性能 | 🟢 8/10 | 参数化查询、连接池、幂等设计，无明显瓶颈 |
| 测试覆盖 | 🟡 6/10 | packages 测试充分，apps 核心业务覆盖薄弱 |

### 问题统计

| 优先级 | 数量 |
|---|---|
| 🔴 Blocker（必须修复） | 3 |
| 🟡 Suggestion（建议修复） | 8 |
| 💭 Nit（锦上添花） | 5 |

---

## 二、🔴 Blocker（必须修复）

### B-1. SSRF 漏洞：Chatwoot `base_url` 校验过宽

**涉及文件**:
- `apps/api/src/operations.ts:1103-1111` — `normalizeHttpUrl()`
- `packages/chatwoot/src/delivery.ts:330-337` — `isSafeBaseUrl()`
- `apps/api/src/chatwoot-delivery.ts:275-282` — `conversationUrl()`

**问题描述**:

`base_url` 是租户可配置字段（通过 `PUT /api/v1/tenants/:tenantId/settings/chatwoot`，见 `operations-routes.ts:318`），但校验逻辑只检查协议是 http 或 https：

```typescript
// apps/api/src/operations.ts:1103
function normalizeHttpUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error();
    return url.toString().replace(/\/$/, '');
  } catch {
    throw new OperationsError('invalid_chatwoot_url', 400);
  }
}

// packages/chatwoot/src/delivery.ts:330
function isSafeBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';  // ← 仅校验协议
  } catch {
    return false;
  }
}
```

当 delivery 或 handoff 执行时，服务器会发起 fetch 到 `${base_url}/api/v1/accounts/.../conversations/.../messages`，host 完全由配置方控制。

**攻击场景**:

拥有租户编辑权限的运营人员（或越权攻击者）可配置：
- `base_url=http://169.254.169.254/latest/meta-data/iam/security-credentials/` —— 探测 AWS 元数据
- `base_url=http://127.0.0.1:6379/` —— 探测内网 Redis
- `base_url=http://10.0.0.1/internal-admin/` —— 访问内网管理后台

随后任意工单触发 delivery 时，服务器会向这些地址发起 POST 请求，实现 SSRF。

**修复建议**:

1. 在 `normalizeHttpUrl` 中增加私网/保留地址过滤：
   ```typescript
   import { isIP } from 'node:net';

   function isPrivateHost(hostname: string): boolean {
     const ip = isIP(hostname);
     if (ip === 0) return false;  // 域名，需 DNS 解析后再判断
     if (ip === 4) {
       return hostname.startsWith('127.') ||
              hostname.startsWith('10.') ||
              hostname.startsWith('169.254.') ||
              hostname.startsWith('192.168.') ||
              /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
              hostname === '0.0.0.0';
     }
     if (ip === 6) {
       return hostname === '::1' || hostname.startsWith('fc') || hostname.startsWith('fd');
     }
     return false;
   }
   ```
2. 对域名做 DNS 解析后再校验 IP（防 DNS rebinding）
3. 引入 `AGENTOPS_CHATWOOT_BASE_URL_ALLOWLIST` 配置，仅允许预批准的 Chatwoot 实例域名
4. `isSafeBaseUrl` 默认拒绝 http（生产环境强制 https），仅在显式配置 `AGENTOPS_ALLOW_HTTP_CHATWOOT=1` 时放行

**风险等级**: 高 —— 可导致内网探测、云凭据泄漏

---

### B-2. 审批动作并发竞态：消息可能重复发送且状态不一致

**涉及文件**: `apps/api/src/operations.ts:207-300` — `applyApprovalAction()`

**问题描述**:

```typescript
async applyApprovalAction(command: ApprovalActionCommand): Promise<ApprovalSummaryRecord> {
  const approval = await this.loadApproval(command.tenantId, command.approvalId);
  if (approval === null) throw new OperationsError('approval_not_found', 404);
  if (approval.state !== 'pending') {                      // ← ① JS 侧检查
    throw new OperationsError('approval_not_pending', 409);
  }
  // ... 准备 content
  if (command.action === 'approve' || command.action === 'edit') {
    const delivery = await this.delivery.deliver(...);     // ← ② 消息已发送给客户
    if (delivery.status !== 'succeeded' && delivery.status !== 'duplicate') {
      throw new OperationsError(`chatwoot_${delivery.code}`, 502);
    }
  }
  await this.pool.query<ApprovalActionRow>(
    `SELECT * FROM apply_approval_action(
       $1, $2, $3, $4, 'pending', $5, ...                 // ← ③ SQL CAS，但返回值未检查
     )`,
    [...],
  );
  // ... 假定成功，继续执行
}
```

三个问题叠加：

1. **JS 检查与 SQL CAS 之间存在时间窗**：①和③之间没有锁，两个并发请求都能通过 ① 的 `state === 'pending'` 检查
2. **消息发送在状态转换之前**：② 已经把回复发给客户，③ 的 CAS 才尝试原子转换。如果 ③ 因并发失败，消息已经发出去了
3. **SQL 返回值被丢弃**：`await this.pool.query(...)` 完全不检查返回行数。即使 CAS 失败（0 行受影响），代码也继续往下走，报告成功

**攻击/触发场景**:

- 两个运营人员几乎同时点击"通过审批"
- 前端因网络抖动重复提交
- 客户端重试逻辑触发

结果：客户收到两条重复回复，审批记录可能停留在 `pending` 或状态不一致，审计日志混乱。

**修复建议**:

方案 A（推荐）：**先 CAS，后投递**
```typescript
// 1. 先尝试原子转换状态为 'processing'（新增中间态）
const claim = await this.pool.query(
  `SELECT * FROM apply_approval_action(..., 'pending', 'processing', ...)`,
  [...],
);
if (claim.rows.length === 0) {
  throw new OperationsError('approval_not_pending', 409);
}
// 2. 再投递消息（依赖 delivery 的幂等性兜底）
const delivery = await this.delivery.deliver(...);
// 3. 投递成功后转换到终态
await this.pool.query(`SELECT * FROM finalize_approval_action(...)`);
```

方案 B：检查 SQL 返回值 + 事务包裹
```typescript
const result = await this.pool.query<ApprovalActionRow>(...);
if (result.rows.length === 0) {
  throw new OperationsError('approval_not_pending', 409);
}
```
并校验返回的 `action_id` 非空。

**风险等级**: 高 —— 数据不一致、客户体验受损、审计失真

---

### B-3. Chatwoot 签名验签在空密钥时静默放行（纵深防御缺口）

**涉及文件**: `packages/chatwoot/src/signature.ts:5-8`

**问题描述**:

```typescript
export function verifyChatwootSignature(input: SignatureVerificationInput): SignatureVerificationResult {
  if (!input.secret) {
    return { configured: false, verified: true };   // ← 空 secret 直接返回 verified: true
  }
  // ...
}
```

**当前缓解**: 调用方 `apps/api/src/ticket-service.ts:85-95` 在调用前已检查 `webhook_secret_ref === null` 并返回 503；`secrets.ts:15` 也会对空字符串抛错。**目前路径上是安全的**。

**为什么仍是 Blocker**:

1. **函数契约本身危险**：`verified: true` 在 `configured: false` 时是一个"说谎"的返回值。任何未来的调用方如果忘记先检查 `configured`，就会无条件放行未签名请求
2. **配置漂移风险**：若某天有人新增一个调用路径（比如管理后台的 webhook 测试端点）直接调用 `verifyChatwootSignature` 而不做前置检查，就会形成签名绕过
3. **违反最小惊讶原则**：一个名为"验签"的函数在密钥缺失时返回"验证通过"，语义上令人困惑

**修复建议**:

```typescript
export function verifyChatwootSignature(input: SignatureVerificationInput): SignatureVerificationResult {
  if (!input.secret) {
    return { configured: false, verified: false, reason: 'secret_not_configured' };
  }
  // ...
}
```

调用方显式决定如何处理 `configured: false`（当前 `ticket-service.ts` 已经在更早的位置处理了这种情况，所以行为不变）。

**风险等级**: 中 —— 当前不可利用，但未来变更极易引入签名绕过

---

## 三、🟡 Suggestion（建议修复）

### S-1. LLM Provider 错误响应体被静默丢弃

**文件**: `apps/api/src/provider.ts:46, 82`

```typescript
if (!response.ok) {
  await response.arrayBuffer();                    // ← 读取后丢弃
  throw new ProviderAdapterError(mapProviderStatus(response.status));
}
```

**问题**: 当 OpenAI 返回 `400 {"error":{"message":"Invalid model: gpt-5","type":"invalid_request_error"}}` 时，详细信息被完全丢弃。`mapProviderStatus` 只能基于 HTTP 状态码粗略分类（`provider_rejected` / `provider_auth_failed` / `provider_retryable_error`），无法区分"模型不存在"、"上下文超长"、"内容违规"等具体原因。

**影响**: LLM 调用失败的根因分析极其困难，运维只能看到 `provider_rejected` 却不知道为什么。这与项目其他部分（如 `llm-observability` 的详细日志）形成反差。

**建议**:
```typescript
if (!response.ok) {
  const errorBody = await readJson(response);
  const providerMessage = extractProviderErrorMessage(errorBody);
  // 不暴露给客户端，但记入 llm_call_logs 的 error_code 或 metadata
  throw new ProviderAdapterError(mapProviderStatus(response.status), providerMessage);
}
```

### S-2. `operations.ts`（1185 行核心业务）无单元测试

**文件**: `apps/api/src/operations.ts`

**问题**: 这是整个 api 应用的核心业务服务，包含：
- 12+ 个 SQL 查询（含事务、CAS、LATERAL JOIN）
- 外部 Chatwoot delivery 调用
- 多步状态机转换
- 审计日志写入
- 加密密钥处理

但 **零直接单元测试**，仅通过 `e2e.test.ts` 间接覆盖。B-2 的竞态问题如果有单测本应被发现。

**影响**:
- SQL 查询回归（字段名变更、JOIN 条件错误）无法在 CI 早期捕获
- 事务边界变更（如 `BEGIN/COMMIT/ROLLBACK` 位置）容易引入部分提交
- 错误码映射（`OperationsError` 的 code 和 statusCode）无回归保护

**建议**: 为每个 public 方法补充测试，至少覆盖：
- happy path
- not_found / 不满足前置条件
- 状态冲突（如 `approval_not_pending`）
- 外部调用失败（delivery 失败、handoff 失败）
- 审计日志被正确写入

可使用 testcontainers 起真实 Postgres，或 mock `Pool`。

### S-3. Guardrails 输出 PII 检测模式与 `pii/mask.ts` 不一致

**文件**: `packages/guardrails/src/guardrails.ts:41-46`

```typescript
const OUTPUT_PII_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,                          // 邮箱 ✓
  /(?<!\d)(?:\+?1[-.\s]?)?(?:\(?[2-9]\d{2}\)?[-.\s]?)\d{3}[-.\s]\d{4}(?!\d)/u,  // 仅美国电话
  /(?<!\d)1[3-9]\d{9}(?!\d)/u,                                            // 中国手机号 ✓
  /\b(?:\d[ -]*?){13,19}\b/u,                                             // 银行卡（无 Luhn）
];
```

对比 `packages/pii/src/mask.ts`，输出门禁**缺少**：
- 国际电话号码（`+\d{1,3}...`）
- 中国身份证号（18 位带校验码）
- 银行卡 Luhn 校验（输出模式只匹配 13-19 位数字，误报率高）
- 中英文地址

**影响**: 一条包含中国身份证号或国际电话的回复可能通过输出门禁，被发送给客户，泄漏 PII。

**建议**: 在输出门禁中复用 `maskPII`：
```typescript
import { maskPII } from '@opensupport/pii';

function evaluateOutputGate(input, createdAt): GateDecision[] {
  if (input.proposed_output === null) return [];
  const piiResult = maskPII(input.proposed_output);
  if (piiResult.replacements.length > 0) {
    return [createDecision(..., 'pii_leak', 'P0', 'sanitize', true, ...)];
  }
  // ...
}
```

### S-4. 工具结果未脱敏即进入 LLM Prompt

**文件**: `apps/api/src/ticket-service.ts:543-555`

```typescript
private async generateResponse(...): Promise<GeneratedResponse> {
  const prompt = JSON.stringify({
    // ...
    masked_customer_text: context.masked_text,    // ← 已脱敏
    evidence_refs: evidenceRefs,
    tool_results: toolResults,                    // ← 未脱敏！
    // ...
  });
}
```

`maskPII` 只对 `message.content`（line 249）应用，`toolResults` 原样进入 prompt。如果工具（如订单查询）返回的客户数据包含电话、地址，这些 PII 会原样进入 LLM 上下文，LLM 可能在回复中复述。

**影响**: PII 经由"工具结果 → LLM prompt → LLM 输出"链路泄漏，绕过了输入侧的脱敏。

**建议**:
- 在 `tool_results` 序列化前对其文本字段应用 `maskPII`
- 或在 ToolExecutor 层面对返回结果统一脱敏
- 或要求所有工具返回结构化数据而非自由文本，由调用方控制 PII

### S-5. `chatwoot-delivery.ts` catch 块吞掉错误无日志

**文件**: `apps/api/src/chatwoot-delivery.ts:123-139`

```typescript
try {
  const response = await this.transport.send(request);
  // ...
} catch {                                          // ← 完全吞掉
  await this.repository.completeDelivery(...);
  return receipt(..., 'retryable_error', ...);
}
```

错误对象完全丢弃，既不记日志也不上报 metric。当 delivery 因 DNS 失败、TCP 重置、TLS 握手失败等原因失败时，运维无任何线索。

**建议**:
```typescript
} catch (error) {
  // 不记录 token 等敏感信息，但记录错误类型和堆栈
  this.options.log?.('delivery_failed', {
    delivery_id: command.delivery_id,
    tenant_id: command.tenant_id,
    error_code: error instanceof Error ? error.name : 'unknown',
    error_message: error instanceof Error ? error.message : String(error),
  });
  await this.repository.completeDelivery(...);
  return receipt(...);
}
```

### S-6. `operator-auth.ts` 的 `safeEqual` 泄露长度信息

**文件**: `apps/api/src/operator-auth.ts:242-247`

```typescript
function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length &&    // ← 长度不同时立即返回
    timingSafeEqual(leftBuffer, rightBuffer);
}
```

**当前缓解**: CSRF token 是 `randomBytes(32).toString('base64url')`，长度恒定（~43 字符），实际可利用性极低。

**为什么仍建议修复**: 这是一处"看起来用了 `timingSafeEqual` 但实际不等长时退化成普通比较"的反模式。代码审计工具会标记，未来若有其他用途（如比对其他 token）会埋雷。

**建议**:
```typescript
function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    // 仍执行一次假比较以保持恒定时间
    timingSafeEqual(leftBuffer, leftBuffer);
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}
```

### S-7. Web 前端 URL 参数未编码

**文件**: `apps/web/src/api.ts:47, 50, 57, 71, 80, 92, 111, 116, 125, 140, 152, 157, 167` 等多处

```typescript
overview: (tenantId: string) =>
  request<Overview>(`/api/v1/tenants/${tenantId}/overview`),    // ← 未 encode

traces: (tenantId: string, limit = 50, offset = 0) =>
  request<Page<Trace>>(
    `/api/v1/tenants/${tenantId}/traces?limit=${limit}&offset=${offset}`,  // ← 未 encode
  ),

approvals: (tenantId: string, state?: Approval['state']) =>
  request<Page<Approval>>(
    `/api/v1/tenants/${tenantId}/approvals?limit=100&offset=0${
      state ? `&state=${state}` : ''                              // ← 未 encode
    }`,
  ),
```

**当前安全**: 所有 ID 来自后端返回的 UUID，`state` 是有限枚举，目前不可利用。

**风险**: 若未来有任何 ID 来源变为用户输入（如 URL 参数透传），或类型被绕过（运行时无校验），就会产生路径穿越或参数注入。

**建议**:
```typescript
overview: (tenantId: string) =>
  request<Overview>(`/api/v1/tenants/${encodeURIComponent(tenantId)}/overview`),

traces: (tenantId: string, limit = 50, offset = 0) => {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return request<Page<Trace>>(
    `/api/v1/tenants/${encodeURIComponent(tenantId)}/traces?${params}`,
  );
},
```

### S-8. `applyApprovalAction` 中 handoff 失败未对操作者可见

**文件**: `apps/api/src/operations.ts:276-295`

```typescript
if (command.action === 'escalate') {
  const connection = await this.repository.getChatwootConnection(command.tenantId);
  if (connection !== null) {
    try {
      await this.conversations.handoff(connection, ...);
    } catch {
      await this.audit(..., 'approval_handoff_failed', ...);   // ← 仅审计日志
    }
  }
}
return required(await this.loadApproval(...), 'approval');     // ← 仍返回"成功"
```

操作者点击"升级"后，前端显示升级成功，但实际上 Chatwoot 会话并未切换到人工坐席。客户体验是"无人响应"。审计日志里有记录，但操作者看不到。

**建议**: 返回值中增加 `warnings` 字段，或在 handoff 失败时抛出带特定 code 的 `OperationsError`（如 `escalate_handoff_failed`），由前端提示"审批已记录但转人工失败，请手动处理"。

---

## 四、💭 Nit（锦上添花）

### N-1. 魔法数字应提取为命名常量

**文件**:
- `apps/api/src/operations.ts:283` — `new Date(Date.now() + 10_000)` (handoff 截止)
- `apps/api/src/operations.ts:1037` — `new Date(Date.now() + 15_000)` (投递截止)
- `apps/api/src/ticket-service.ts:333, 567` — `300`, `500` (maxOutputTokens)

对比 `ticket-service.ts:252` 已经用了 `this.options.pipelineDeadlineMs`，建议保持一致。

### N-2. `ticket-service.ts` 的 280 行 try 块难以阅读

**文件**: `apps/api/src/ticket-service.ts:248-530`

try 块从 `parseMasterKey` 一直延伸到 return，跨越 ~280 行。`finally` 仅用于 `masterKey.fill(0)`。

**建议**: 把 try 内部逻辑抽成 `private async executePipeline(...)`，try/finally 只包裹密钥生命周期。

### N-3. `guardrails.ts` 死代码

**文件**: `packages/guardrails/src/guardrails.ts:81`

```typescript
const highestSeverity = effective[0]?.severity ?? 'P3';
```

`effective` 在 line 66-80 保证至少有一个 'safe' 决策，`effective[0]` 永远非空，`?? 'P3'` 不可达。删除或加注释说明是类型层面兜底。

### N-4. `signature.ts` 同时接受 `sha256=` 前缀和裸 hex

**文件**: `packages/chatwoot/src/signature.ts:22`

```typescript
const verified = signaturesMatch(signature, expected) || signaturesMatch(signature, expectedHex);
```

Chatwoot 官方文档签名格式为 `sha256=<hex>`，裸 hex 接受是不必要的兼容面。若为向后兼容，请加注释；否则删除第二项。

### N-5. `provider.ts` 大小写不敏感的 provider 分发

**文件**: `apps/api/src/provider.ts:14`

```typescript
return request.provider.toLowerCase() === 'anthropic'
  ? this.invokeAnthropic(request)
  : this.invokeOpenAICompatible(request);
```

与 `envelope.ts:249` 的 `provider.trim().toLowerCase()` 一致，行为正确。但建议加一行注释说明"provider 名大小写不敏感是有意为之，与加密 AAD 的归一化策略保持一致"。

---

## 五、值得肯定的设计

这部分不是客套，是真实记录，方便团队继承和新人 onboarding：

1. **信封加密（`model-config/envelope.ts`）** — AES-256-GCM，数据密钥由主密钥包裹，AAD 绑定 tenant+provider+keyId 防止跨租户密钥滥用，`finally` 中 `fill(0)` 清零。这是教科书级别的实现。

2. **HMAC 时序安全签名（`chatwoot/signature.ts`）** — 使用 `timingSafeEqual` 而非 `===`，正确处理了时序攻击。

3. **全面参数化 SQL** — 所有 `pool.query` 调用都用 `$1, $2...` 占位符，未发现任何字符串拼接 SQL。这在 1185 行的 `operations.ts` 中也严格保持。

4. **密钥管理的纵深防御** — 环境变量名正则白名单、文件读取兜底、Buffer 清零、`AGENTOPS_MASTER_KEY_FILE` 指向文件而非明文 env。`config.ts` 的校验逻辑（范围、类型、必填）非常细致。

5. **JSON Schema 严格校验** — 所有路由都配置 `additionalProperties: false`、UUID pattern、maxLength、`confirm: { const: true }`。`mutationGuards` 还显式拒绝客户端传入 `actor_id`，强制服务端从会话取。这是防越权的好实践。

6. **租户隔离（`assertTenant`）** — 在 `preHandler` 钩子中统一校验 `tenantId` 参数与 principal 的 `tenant_ids` 集合，admin 角色才允许跨租户。

7. **PII 脱敏（`pii/mask.ts`）** — 多模式优先级、重叠消解、Luhn 校验银行卡、中国身份证校验码、订单号保护区间。比大多数项目的"正则替换邮箱"成熟得多。

8. **Guardrails 四门禁（`guardrails.ts`）** — input/retrieval/tool/output 四道门，P0-P3 分级，决策 ID 确定性哈希，支持注入 modelJudge 做语义级判断。

9. **幂等性设计** — 投递幂等（idempotency_key + input_hash）、canonical event 去重、outbox 模式。`ChatwootDeliveryService` 的 `Map<scope, DeliveryRecord>` + failed 自动清除设计很巧妙。

10. **成本治理** — LLM 调用前预估算成本，按工单和日预算双闸门，超预算直接 `cancelled` 不发请求。`llm-observability` 的日志字段非常完整。

---

## 六、修复优先级建议

| 优先级 | 问题编号 | 建议时间窗口 |
|---|---|---|
| P0 立即 | B-1 (SSRF), B-2 (竞态) | 1 周内 |
| P0 立即 | B-3 (签名契约) | 1 周内（改动小） |
| P1 短期 | S-1 (provider 错误), S-2 (operations 测试), S-3 (输出 PII), S-4 (工具结果脱敏) | 2-4 周内 |
| P2 中期 | S-5 ~ S-8 | 1-2 个月内 |
| P3 长期 | N-1 ~ N-5 | 机会主义修复 |

---

## 七、附录：审查覆盖范围

### 已逐行审查的文件

**apps/api/src/**:
- `operator-auth.ts` (OIDC 认证授权)
- `chatwoot-delivery.ts` (持久化投递服务)
- `provider.ts` (LLM Provider 适配器)
- `config.ts` (配置加载与校验)
- `secrets.ts` (环境变量密钥解析)
- `operations-routes.ts` (运营 API 路由)
- `chatwoot-routes.ts` (Webhook 入口路由)
- `operations.ts` (核心业务服务，1185 行)
- `ticket-service.ts` (工单执行主流程)

**apps/worker/src/**:
- `worker.ts` (异步任务消费者)

**apps/web/src/**:
- `api.ts` (前端 HTTP 客户端)

**packages/**:
- `chatwoot/src/delivery.ts` (投递服务 + transport)
- `chatwoot/src/signature.ts` (HMAC 验签)
- `pii/src/mask.ts` (PII 脱敏)
- `model-config/src/envelope.ts` (信封加密)
- `llm-runtime/src/runtime.ts` (租户模型调用)
- `guardrails/src/guardrails.ts` (风险门禁)

### 全局扫描项

- ✅ `eval()` / `new Function()` / `child_process` —— 源码中无（仅 node_modules 与 Redis `eval` 命令）
- ✅ 敏感信息 console.log —— web 前端无
- ✅ `Object.assign` 原型污染 —— 无用户输入流入
- ✅ 硬编码密钥 —— 仅测试 fixture，生产代码无
- ✅ SQL 字符串拼接 —— 全部参数化
- ✅ `.env` / 密钥文件 git 跟踪 —— `.gitignore` 已覆盖，`git check-ignore` 确认

### 未深入审查的领域（建议后续补充）

- `infra/` 下的 SQL 迁移脚本（31 个文件）—— 建议审查存储过程 `apply_approval_action`、`transition_release_candidate` 的 CAS 实现是否与 B-2 的修复方案匹配
- `scripts/` 下的 67 个 `.mjs` 脚本 —— 部署、验证、报告脚本，建议审查是否有命令注入
- `apps/api/src/e2e-repository.ts` —— 仅扫描了 SQL 模式，未逐行审查
- Redis Streams 消费者组的边界条件（`apps/worker/src/redis-streams.ts`）
- 前端 React 组件的 XSS 防护（`apps/web/src/views/`、`components/`）

---

**报告结束**。如需对任何一项展开更深入的分析、提供具体补丁示例、或针对未审查领域补充审查，请告知。

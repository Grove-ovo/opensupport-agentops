# Phase 2B LLM Runtime And Conditional Triage

## Scenario: Tenant-Scoped Model Invocation

### 1. Scope / Trigger

- Applies to `packages/llm-runtime`, triage contracts, model adapters, timeout,
  fallback, budget preflight, and LLM attempt logging.
- Does not authorize RAG, tools, response generation, approvals, or live
  provider integration tests.

### 2. Signatures

```ts
invokeTenantModel<T>(input: InvokeTenantModelInput): Promise<LLMRuntimeResult<T>>
runConditionalTriage(input: RunConditionalTriageInput): Promise<ConditionalTriageResult>
```

### 3. Contracts

- Context tenant and `model_config_version_id` must match the immutable config.
- Budget preflight runs before BYOK decryption and provider invocation.
- Fast model is attempted first; a distinct fallback is attempted at most once.
- Every attempt writes an append-only Phase 1 LLM log.
- Logs contain no API key, prompt, completion, or raw provider payload.
- Triage is skipped when the deterministic router is sufficient.
- Triage output is schema-validated and includes immutable prompt/model refs.

### 4. Validation & Error Matrix

| Condition | Behavior |
|-----------|----------|
| Config/trace tenant or version mismatch | throw `model_config_mismatch` before call |
| Ticket/daily budget exceeded | degraded result, zero calls |
| Provider timeout | log timed out attempt, optionally fallback |
| Invalid structured output | log `invalid_model_output`, optionally fallback |
| Both attempts fail | degraded result with final reason |
| Clear deterministic route | skipped, zero calls |

### 5. Good/Base/Bad Cases

- Good: decrypt tenant BYOK inside one call and pass it only to the adapter.
- Base: fallback equals fast model; perform one attempt.
- Bad: read a global provider API key.
- Bad: persist prompts/completions or encrypted references in call logs.

### 6. Tests Required

- Skip, success, fallback, budget block, timeout, provider failure, invalid
  output, and config mismatch.
- Assert logs and results contain no plaintext key or prompt.
- Run full repository tests because shared contracts and workspaces change.

### 7. Wrong vs Correct

#### Wrong

```ts
const apiKey = process.env.OPENAI_API_KEY;
```

#### Correct

```ts
const apiKey = decryptApiKey({
  encryptedReference: config.encrypted_api_key_ref,
  tenantId: context.tenant_id,
  provider: config.provider,
  masterKey,
});
```

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTenantModelConfig,
  decryptApiKey,
  ModelConfigValidationError,
  parseMasterKey,
  SecretReferenceError,
} from './index.js';

const masterKey = Buffer.alloc(32, 7);
const tenantId = '11111111-1111-4111-8111-111111111111';

test('creates the PRD tenant model config without retaining the plaintext API key', () => {
  const input = validInput();
  const config = createTenantModelConfig(input, {
    masterKey,
    keyId: 'local-dev-v1',
  });

  assert.equal(config.tenant_id, tenantId);
  assert.equal(config.provider, 'openai');
  assert.equal(config.fast_model, 'gpt-4.1-mini');
  assert.equal(config.strong_model, 'gpt-4.1');
  assert.equal(config.embedding_model, 'text-embedding-3-small');
  assert.equal(config.fallback_model, 'gpt-4.1-mini');
  assert.equal(config.timeout_ms, 10_000);
  assert.equal(config.max_cost_per_ticket, 0.02);
  assert.equal(config.daily_budget, 5);
  assert.equal(config.budget_currency, 'USD');
  assert.equal(config.version, 1);
  assert.equal(config.is_active, true);
  assert.match(config.config_fingerprint, /^[a-f0-9]{64}$/);
  assert.match(config.encrypted_api_key_ref, /^enc:v1:local-dev-v1:/);
  assert.doesNotMatch(JSON.stringify(config), /sk-phase1c-secret/);
});

test('round-trips an encrypted API key only with matching tenant and provider context', () => {
  const config = createTenantModelConfig(validInput(), {
    masterKey,
    keyId: 'local-dev-v1',
  });

  assert.equal(
    decryptApiKey({
      encryptedReference: config.encrypted_api_key_ref,
      masterKey,
      tenantId,
      provider: 'openai',
    }),
    'sk-phase1c-secret',
  );

  assert.throws(
    () => decryptApiKey({
      encryptedReference: config.encrypted_api_key_ref,
      masterKey,
      tenantId: '22222222-2222-4222-8222-222222222222',
      provider: 'openai',
    }),
    (error: unknown) =>
      error instanceof SecretReferenceError && error.code === 'decryption_failed',
  );
});

test('rejects tampered encrypted references', () => {
  const config = createTenantModelConfig(validInput(), {
    masterKey,
    keyId: 'local-dev-v1',
  });
  const parts = config.encrypted_api_key_ref.split(':');
  const ciphertext = parts.at(-1);
  assert.ok(ciphertext);
  parts[parts.length - 1] = `${ciphertext[0] === 'A' ? 'B' : 'A'}${ciphertext.slice(1)}`;
  const tampered = parts.join(':');

  assert.throws(
    () => decryptApiKey({
      encryptedReference: tampered,
      masterKey,
      tenantId,
      provider: 'openai',
    }),
    (error: unknown) =>
      error instanceof SecretReferenceError && error.code === 'decryption_failed',
  );
});

test('authenticates the key id stored in the encrypted reference', () => {
  const config = createTenantModelConfig(validInput(), {
    masterKey,
    keyId: 'local-dev-v1',
  });
  const tampered = config.encrypted_api_key_ref.replace(
    ':local-dev-v1:',
    ':local-dev-v2:',
  );

  assert.throws(
    () => decryptApiKey({
      encryptedReference: tampered,
      masterKey,
      tenantId,
      provider: 'openai',
    }),
    (error: unknown) =>
      error instanceof SecretReferenceError && error.code === 'decryption_failed',
  );
});

test('produces the same fingerprint for equivalent non-secret config values', () => {
  const first = createTenantModelConfig(validInput(), {
    masterKey,
    keyId: 'local-dev-v1',
  });
  const second = createTenantModelConfig(
    validInput({ apiKey: 'different-secret' }),
    { masterKey, keyId: 'local-dev-v1' },
  );

  assert.equal(first.config_fingerprint, second.config_fingerprint);
  assert.notEqual(first.encrypted_api_key_ref, second.encrypted_api_key_ref);
});

test('uses unambiguous fingerprint serialization for model names containing separators', () => {
  const first = createTenantModelConfig(
    validInput({
      fastModel: 'fast\u001fshifted',
      strongModel: 'strong',
    }),
    { masterKey, keyId: 'local-dev-v1' },
  );
  const second = createTenantModelConfig(
    validInput({
      fastModel: 'fast',
      strongModel: 'shifted\u001fstrong',
    }),
    { masterKey, keyId: 'local-dev-v1' },
  );

  assert.notEqual(first.config_fingerprint, second.config_fingerprint);
});

test('accepts UUIDv7 tenant identifiers supported by PostgreSQL uuid columns', () => {
  const config = createTenantModelConfig(
    validInput({ tenantId: '0192f2a0-9b4c-7def-8abc-1234567890ab' }),
    { masterKey, keyId: 'local-dev-v1' },
  );

  assert.equal(config.tenant_id, '0192f2a0-9b4c-7def-8abc-1234567890ab');
});

test('rejects invalid model config fields together', () => {
  assert.throws(
    () => createTenantModelConfig(
      validInput({
        provider: ' ',
        tenantId: 'tenant_demo',
        fastModel: '',
        timeoutMs: 120_001,
        maxCostPerTicket: -1,
        dailyBudget: 5.0000001,
        budgetCurrency: 'US',
        apiKey: '',
      }),
      { masterKey, keyId: 'local-dev-v1' },
    ),
    (error: unknown) => {
      assert.ok(error instanceof ModelConfigValidationError);
      assert.deepEqual(
        error.issues.map((issue) => issue.field),
        [
          'tenantId',
          'provider',
          'fastModel',
          'timeoutMs',
          'maxCostPerTicket',
          'dailyBudget',
          'budgetCurrency',
          'apiKey',
        ],
      );
      return true;
    },
  );
});

test('reports malformed encrypted references before authentication failures', () => {
  assert.throws(
    () => decryptApiKey({
      encryptedReference: 'enc:v1:incomplete',
      masterKey,
      tenantId,
      provider: 'openai',
    }),
    (error: unknown) =>
      error instanceof SecretReferenceError && error.code === 'invalid_reference',
  );
});

test('parses versioned base64, base64url, and hex master keys and rejects invalid lengths', () => {
  const base64Key = `base64:${masterKey.toString('base64')}`;
  const base64UrlKey = `base64url:${masterKey.toString('base64url')}`;
  const hexKey = `hex:${masterKey.toString('hex')}`;

  assert.deepEqual(parseMasterKey(base64Key), masterKey);
  assert.deepEqual(parseMasterKey(base64UrlKey), masterKey);
  assert.deepEqual(parseMasterKey(hexKey), masterKey);
  assert.throws(
    () => parseMasterKey('base64:c2hvcnQ'),
    (error: unknown) =>
      error instanceof SecretReferenceError && error.code === 'invalid_master_key',
  );
  assert.throws(
    () => parseMasterKey(`base64:${masterKey.toString('base64url')}`),
    (error: unknown) =>
      error instanceof SecretReferenceError && error.code === 'invalid_master_key',
  );
});

test('rejects whitespace-only API keys without normalizing secret contents', () => {
  assert.throws(
    () => createTenantModelConfig(
      validInput({ apiKey: '   ' }),
      { masterKey, keyId: 'local-dev-v1' },
    ),
    (error: unknown) =>
      error instanceof ModelConfigValidationError &&
      error.issues.some((issue) => issue.field === 'apiKey'),
  );
});

function validInput(
  overrides: Partial<ReturnType<typeof baseInput>> = {},
): ReturnType<typeof baseInput> {
  return { ...baseInput(), ...overrides };
}

function baseInput() {
  return {
    tenantId,
    version: 1,
    provider: 'OpenAI',
    fastModel: 'gpt-4.1-mini',
    strongModel: 'gpt-4.1',
    embeddingModel: 'text-embedding-3-small',
    fallbackModel: 'gpt-4.1-mini',
    timeoutMs: 10_000,
    maxCostPerTicket: 0.02,
    dailyBudget: 5,
    budgetCurrency: 'usd',
    apiKey: 'sk-phase1c-secret',
    isActive: true,
  };
}

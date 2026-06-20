import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';
import { SecretReferenceError } from './errors.js';
import type {
  DecryptApiKeyInput,
  EncryptApiKeyInput,
} from './types.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const MASTER_KEY_BYTES = 32;
const REFERENCE_PREFIX = 'enc:v1';
const KEY_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export function encryptApiKey(input: EncryptApiKeyInput): string {
  if (input.apiKey.trim().length === 0) {
    throw new SecretReferenceError('invalid_reference');
  }

  const masterKey = normalizeMasterKey(input.masterKey);
  let dataKey: Buffer | undefined;

  try {
    validateKeyId(input.keyId);
    const context = normalizeContext(input.tenantId, input.provider);
    dataKey = randomBytes(MASTER_KEY_BYTES);
    const keyWrapIv = randomBytes(IV_BYTES);
    const keyCipher = createCipheriv(ALGORITHM, masterKey, keyWrapIv);
    keyCipher.setAAD(buildAdditionalAuthenticatedData('key', context, input.keyId));
    const wrappedDataKey = Buffer.concat([
      keyCipher.update(dataKey),
      keyCipher.final(),
    ]);
    const wrappedDataKeyAuthTag = keyCipher.getAuthTag();
    const dataIv = randomBytes(IV_BYTES);
    const dataCipher = createCipheriv(ALGORITHM, dataKey, dataIv);
    dataCipher.setAAD(buildAdditionalAuthenticatedData('data', context, input.keyId));
    const ciphertext = Buffer.concat([
      dataCipher.update(input.apiKey, 'utf8'),
      dataCipher.final(),
    ]);
    const dataAuthTag = dataCipher.getAuthTag();

    return [
      REFERENCE_PREFIX,
      input.keyId,
      keyWrapIv.toString('base64url'),
      wrappedDataKeyAuthTag.toString('base64url'),
      wrappedDataKey.toString('base64url'),
      dataIv.toString('base64url'),
      dataAuthTag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join(':');
  } finally {
    dataKey?.fill(0);
    masterKey.fill(0);
  }
}

export function decryptApiKey(input: DecryptApiKeyInput): string {
  const masterKey = normalizeMasterKey(input.masterKey);
  let dataKey: Buffer | undefined;

  try {
    const parsed = parseEncryptedReference(input.encryptedReference);
    const context = normalizeContext(input.tenantId, input.provider);
    const keyDecipher = createDecipheriv(ALGORITHM, masterKey, parsed.keyWrapIv);
    keyDecipher.setAAD(buildAdditionalAuthenticatedData('key', context, parsed.keyId));
    keyDecipher.setAuthTag(parsed.wrappedDataKeyAuthTag);
    dataKey = Buffer.concat([
      keyDecipher.update(parsed.wrappedDataKey),
      keyDecipher.final(),
    ]);

    if (dataKey.length !== MASTER_KEY_BYTES) {
      throw new SecretReferenceError('decryption_failed');
    }

    const decipher = createDecipheriv(ALGORITHM, dataKey, parsed.dataIv);
    decipher.setAAD(buildAdditionalAuthenticatedData('data', context, parsed.keyId));
    decipher.setAuthTag(parsed.dataAuthTag);
    const plaintext = Buffer.concat([
      decipher.update(parsed.ciphertext),
      decipher.final(),
    ]);

    try {
      return plaintext.toString('utf8');
    } finally {
      plaintext.fill(0);
    }
  } catch (error) {
    if (error instanceof SecretReferenceError && error.code === 'invalid_reference') {
      throw error;
    }
    throw new SecretReferenceError('decryption_failed');
  } finally {
    dataKey?.fill(0);
    masterKey.fill(0);
  }
}

export function parseMasterKey(value: string): Buffer {
  const [encoding, encoded, ...extra] = value.split(':');

  if (extra.length > 0 || !encoded) {
    throw new SecretReferenceError('invalid_master_key');
  }

  let key: Buffer;

  if (encoding === 'base64url') {
    if (!BASE64URL_PATTERN.test(encoded)) {
      throw new SecretReferenceError('invalid_master_key');
    }
    key = Buffer.from(encoded, 'base64url');
    if (key.toString('base64url') !== encoded) {
      throw new SecretReferenceError('invalid_master_key');
    }
  } else if (encoding === 'base64') {
    if (!BASE64_PATTERN.test(encoded)) {
      throw new SecretReferenceError('invalid_master_key');
    }
    key = Buffer.from(encoded, 'base64');
    if (key.toString('base64') !== encoded) {
      throw new SecretReferenceError('invalid_master_key');
    }
  } else if (encoding === 'hex') {
    if (!/^[a-fA-F0-9]{64}$/.test(encoded)) {
      throw new SecretReferenceError('invalid_master_key');
    }
    key = Buffer.from(encoded, 'hex');
  } else {
    throw new SecretReferenceError('invalid_master_key');
  }

  return normalizeMasterKey(key);
}

function parseEncryptedReference(reference: string): {
  keyId: string;
  keyWrapIv: Buffer;
  wrappedDataKeyAuthTag: Buffer;
  wrappedDataKey: Buffer;
  dataIv: Buffer;
  dataAuthTag: Buffer;
  ciphertext: Buffer;
} {
  const [
    prefix,
    version,
    keyId,
    keyWrapIvEncoded,
    wrappedDataKeyAuthTagEncoded,
    wrappedDataKeyEncoded,
    dataIvEncoded,
    dataAuthTagEncoded,
    ciphertextEncoded,
    ...extra
  ] = reference.split(':');

  if (
    prefix !== 'enc' ||
    version !== 'v1' ||
    !keyId ||
    !keyWrapIvEncoded ||
    !wrappedDataKeyAuthTagEncoded ||
    !wrappedDataKeyEncoded ||
    !dataIvEncoded ||
    !dataAuthTagEncoded ||
    !ciphertextEncoded ||
    extra.length > 0
  ) {
    throw new SecretReferenceError('invalid_reference');
  }

  if (!KEY_ID_PATTERN.test(keyId)) {
    throw new SecretReferenceError('invalid_reference');
  }
  const keyWrapIv = decodeBase64Url(keyWrapIvEncoded);
  const wrappedDataKeyAuthTag = decodeBase64Url(wrappedDataKeyAuthTagEncoded);
  const wrappedDataKey = decodeBase64Url(wrappedDataKeyEncoded);
  const dataIv = decodeBase64Url(dataIvEncoded);
  const dataAuthTag = decodeBase64Url(dataAuthTagEncoded);
  const ciphertext = decodeBase64Url(ciphertextEncoded);

  if (
    keyWrapIv.length !== IV_BYTES ||
    wrappedDataKeyAuthTag.length !== 16 ||
    wrappedDataKey.length !== MASTER_KEY_BYTES ||
    dataIv.length !== IV_BYTES ||
    dataAuthTag.length !== 16 ||
    ciphertext.length === 0
  ) {
    throw new SecretReferenceError('invalid_reference');
  }

  return {
    keyId,
    keyWrapIv,
    wrappedDataKeyAuthTag,
    wrappedDataKey,
    dataIv,
    dataAuthTag,
    ciphertext,
  };
}

function normalizeMasterKey(value: Uint8Array): Buffer {
  const key = Buffer.from(value);

  if (key.length !== MASTER_KEY_BYTES) {
    throw new SecretReferenceError('invalid_master_key');
  }

  return key;
}

function validateKeyId(keyId: string): void {
  if (!KEY_ID_PATTERN.test(keyId)) {
    throw new SecretReferenceError('invalid_key_id');
  }
}

function decodeBase64Url(value: string): Buffer {
  if (!BASE64URL_PATTERN.test(value)) {
    throw new SecretReferenceError('invalid_reference');
  }

  const decoded = Buffer.from(value, 'base64url');

  if (decoded.toString('base64url') !== value) {
    throw new SecretReferenceError('invalid_reference');
  }

  return decoded;
}

function normalizeContext(
  tenantId: string,
  provider: string,
): { tenantId: string; provider: string } {
  const normalizedTenantId = tenantId.trim();
  const normalizedProvider = provider.trim().toLowerCase();

  if (normalizedTenantId.length === 0 || normalizedProvider.length === 0) {
    throw new SecretReferenceError('invalid_reference');
  }

  return {
    tenantId: normalizedTenantId,
    provider: normalizedProvider,
  };
}

function buildAdditionalAuthenticatedData(
  purpose: 'key' | 'data',
  context: { tenantId: string; provider: string },
  keyId: string,
): Buffer {
  return Buffer.from(
    `tenant_model_config:${purpose}:${context.tenantId}:${context.provider}:${keyId}`,
    'utf8',
  );
}

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PERMISSIVE_CHATWOOT_URL_POLICY,
  type ChatwootUrlPolicy,
} from '@opensupport/shared';
import { OperationsError, normalizeHttpUrl } from './operations.js';

// P1: the authoritative write-path SSRF gate (admin-entered Chatwoot base_url).
// Integration/e2e tests insert connections via raw SQL and bypass this gate, so
// without these unit tests the rejection -> OperationsError-code mapping has no
// coverage. Each case pins one branch of normalizeHttpUrl.

function expectRejection(
  value: string,
  policy: ChatwootUrlPolicy,
  code: string,
): void {
  assert.throws(
    () => normalizeHttpUrl(value, policy),
    (error: unknown) => {
      assert.ok(
        error instanceof OperationsError,
        'expected an OperationsError',
      );
      assert.equal(error.code, code);
      assert.equal(error.statusCode, 400);
      return true;
    },
    `expected ${value} to be rejected as ${code}`,
  );
}

test('normalizeHttpUrl accepts an allowed https url and strips trailing slashes', () => {
  const policy: ChatwootUrlPolicy = {
    allowlist: ['.acme.com'],
    requireHttps: true,
  };
  assert.equal(
    normalizeHttpUrl('https://support.acme.com/', policy),
    'https://support.acme.com',
  );
});

test('normalizeHttpUrl accepts a public https url under the permissive policy', () => {
  assert.equal(
    normalizeHttpUrl('https://help.example.org', PERMISSIVE_CHATWOOT_URL_POLICY),
    'https://help.example.org',
  );
});

test('normalizeHttpUrl maps insecure_scheme -> insecure_chatwoot_url', () => {
  expectRejection(
    'http://support.acme.com',
    { allowlist: [], requireHttps: true },
    'insecure_chatwoot_url',
  );
});

test('normalizeHttpUrl maps private_host -> unsafe_chatwoot_url', () => {
  // Private/loopback targets are rejected regardless of policy (SSRF core).
  expectRejection(
    'http://127.0.0.1:3000',
    PERMISSIVE_CHATWOOT_URL_POLICY,
    'unsafe_chatwoot_url',
  );
  expectRejection(
    'https://192.168.1.10',
    PERMISSIVE_CHATWOOT_URL_POLICY,
    'unsafe_chatwoot_url',
  );
});

test('normalizeHttpUrl maps not_in_allowlist -> chatwoot_url_not_allowlisted', () => {
  expectRejection(
    'https://chatwoot.evil.example',
    { allowlist: ['app.chatwoot.com'], requireHttps: false },
    'chatwoot_url_not_allowlisted',
  );
});

test('normalizeHttpUrl maps invalid_url and non-http schemes -> invalid_chatwoot_url', () => {
  expectRejection('not-a-url', PERMISSIVE_CHATWOOT_URL_POLICY, 'invalid_chatwoot_url');
  expectRejection(
    'ftp://files.example.com',
    PERMISSIVE_CHATWOOT_URL_POLICY,
    'invalid_chatwoot_url',
  );
});

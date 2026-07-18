import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateChatwootBaseUrl,
  isPrivateHostname,
  parseChatwootAllowlist,
  PERMISSIVE_CHATWOOT_URL_POLICY,
  type ChatwootUrlPolicy,
} from './chatwoot-url.js';

function policy(overrides: Partial<ChatwootUrlPolicy> = {}): ChatwootUrlPolicy {
  return { allowlist: [], requireHttps: false, ...overrides };
}

test('parseChatwootAllowlist trims, lowercases, and drops blanks', () => {
  assert.deepEqual(
    parseChatwootAllowlist(' Chatwoot.Example.com , , .internal.example.com '),
    ['chatwoot.example.com', '.internal.example.com'],
  );
  assert.deepEqual(parseChatwootAllowlist(undefined), []);
  assert.deepEqual(parseChatwootAllowlist(''), []);
});

test('isPrivateHostname flags loopback, link-local, and RFC1918 ranges', () => {
  for (const host of [
    'localhost',
    '127.0.0.1',
    '10.1.2.3',
    '169.254.169.254',
    '192.168.0.1',
    '172.16.0.1',
    '::1',
    'fd00::1',
  ]) {
    assert.equal(isPrivateHostname(host), true, host);
  }
  for (const host of ['chatwoot.example.com', '8.8.8.8', '172.32.0.1']) {
    assert.equal(isPrivateHostname(host), false, host);
  }
});

test('permissive policy accepts any public host over http or https', () => {
  const https = evaluateChatwootBaseUrl(
    'https://chatwoot.example.com/',
    PERMISSIVE_CHATWOOT_URL_POLICY,
  );
  assert.deepEqual(https, { ok: true, normalized: 'https://chatwoot.example.com' });
  assert.equal(
    evaluateChatwootBaseUrl('http://chatwoot.example.com', PERMISSIVE_CHATWOOT_URL_POLICY).ok,
    true,
  );
});

test('private hosts are rejected before any allowlist check (DNS-free)', () => {
  assert.deepEqual(
    evaluateChatwootBaseUrl('https://169.254.169.254', policy()),
    { ok: false, reason: 'private_host' },
  );
  assert.deepEqual(
    evaluateChatwootBaseUrl('http://127.0.0.1:3000', policy()),
    { ok: false, reason: 'private_host' },
  );
});

test('requireHttps rejects plaintext schemes', () => {
  assert.deepEqual(
    evaluateChatwootBaseUrl('http://chatwoot.example.com', policy({ requireHttps: true })),
    { ok: false, reason: 'insecure_scheme' },
  );
  assert.equal(
    evaluateChatwootBaseUrl('https://chatwoot.example.com', policy({ requireHttps: true })).ok,
    true,
  );
});

test('allowlist pins accepted hosts and blocks look-alikes', () => {
  const pinned = policy({ allowlist: ['chatwoot.example.com', '.internal.example.com'] });
  assert.equal(evaluateChatwootBaseUrl('https://chatwoot.example.com', pinned).ok, true);
  assert.equal(evaluateChatwootBaseUrl('https://app.internal.example.com', pinned).ok, true);
  assert.equal(evaluateChatwootBaseUrl('https://internal.example.com', pinned).ok, true);
  assert.deepEqual(
    evaluateChatwootBaseUrl('https://chatwoot.evil.com', pinned),
    { ok: false, reason: 'not_in_allowlist' },
  );
  // Suffix guard must not match a bare concatenation without the dot boundary.
  assert.deepEqual(
    evaluateChatwootBaseUrl('https://notinternal.example.com.evil.com', pinned),
    { ok: false, reason: 'not_in_allowlist' },
  );
});

test('allowlist entries may pin an explicit port', () => {
  const pinned = policy({ allowlist: ['chatwoot.example.com:8443'] });
  assert.equal(evaluateChatwootBaseUrl('https://chatwoot.example.com:8443', pinned).ok, true);
  assert.deepEqual(
    evaluateChatwootBaseUrl('https://chatwoot.example.com:9000', pinned),
    { ok: false, reason: 'not_in_allowlist' },
  );
});

test('non-http(s) schemes and malformed urls are rejected', () => {
  assert.deepEqual(
    evaluateChatwootBaseUrl('ftp://chatwoot.example.com', policy()),
    { ok: false, reason: 'invalid_url' },
  );
  assert.deepEqual(
    evaluateChatwootBaseUrl('not a url', policy()),
    { ok: false, reason: 'invalid_url' },
  );
});

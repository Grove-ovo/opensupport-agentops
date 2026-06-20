import { existsSync, readFileSync } from 'node:fs';

const required = [
  'packages/shared/src/chatwoot-delivery.ts',
  'packages/chatwoot/src/delivery.ts',
  'packages/chatwoot/src/delivery.test.ts',
  '.trellis/spec/integrations/phase-3c-chatwoot-delivery.md',
  'docs/chatwoot_connector.md',
];
const failures = required
  .filter((path) => !existsSync(path))
  .map((path) => `missing Phase 3C artifact: ${path}`);
const delivery = read('packages/chatwoot/src/delivery.ts');
const shared = read('packages/shared/src/chatwoot-delivery.ts');
for (const value of [
  'ChatwootDeliveryService',
  'buildChatwootTransportRequest',
  'api_access_token',
  'idempotency_conflict',
  'content_hash_mismatch',
  'timed_out',
]) {
  if (!delivery.includes(value)) failures.push(`delivery adapter must include ${value}`);
}
for (const value of [
  'private_note',
  'public_reply',
  'ChatwootDeliveryReceipt',
  'credential_ref_hash',
]) {
  if (!shared.includes(value)) failures.push(`shared delivery contract must include ${value}`);
}
if (shared.includes('api_access_token')) {
  failures.push('provider-neutral commands must not include plaintext token fields');
}
if (failures.length) {
  console.error('Phase 3C validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 3C validation passed');

function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

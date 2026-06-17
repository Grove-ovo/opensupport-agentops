import { createHmac, timingSafeEqual } from 'node:crypto';
import { getHeader } from './headers.js';
import type { SignatureVerificationInput, SignatureVerificationResult } from './types.js';

export function verifyChatwootSignature(input: SignatureVerificationInput): SignatureVerificationResult {
  if (!input.secret) {
    return { configured: false, verified: true };
  }

  const timestamp = getHeader(input.headers, 'x-chatwoot-timestamp');
  const signature = getHeader(input.headers, 'x-chatwoot-signature');

  if (!timestamp || !signature) {
    return { configured: true, verified: false, reason: 'missing_signature_headers' };
  }

  const expectedHex = createHmac('sha256', input.secret)
    .update(`${timestamp}.${toRawBodyString(input.rawBody)}`)
    .digest('hex');
  const expected = `sha256=${expectedHex}`;

  const verified = signaturesMatch(signature, expected) || signaturesMatch(signature, expectedHex);

  if (verified) {
    return { configured: true, verified: true };
  }

  return { configured: true, verified: false, reason: 'mismatch' };
}

function signaturesMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function toRawBodyString(rawBody: string | Buffer): string {
  return Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
}

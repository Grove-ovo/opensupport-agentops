import { isIP } from 'node:net';

/**
 * Policy applied to a Chatwoot `base_url` before it is trusted for delivery.
 *
 * The allowlist is the primary SSRF control: DNS rebinding lets an attacker
 * register a public name that resolves to a metadata or loopback address, so
 * an IP blacklist alone (evaluated before resolution) cannot stop it. Pinning
 * the accepted hosts up front is deterministic and DNS-free, which also keeps
 * the check synchronous and unit-testable.
 */
export interface ChatwootUrlPolicy {
  /**
   * Allowed host entries. Empty means the allowlist gate is disabled and any
   * public host is accepted (the IP blacklist still applies). Each entry is
   * matched case-insensitively as:
   *  - an exact hostname (`chatwoot.example.com`), optionally with a port
   *    (`chatwoot.example.com:8443`), or
   *  - a leading-dot suffix (`.example.com`) matching the apex and any
   *    subdomain.
   */
  readonly allowlist: readonly string[];
  /** Reject any non-`https:` scheme when true. */
  readonly requireHttps: boolean;
}

export type ChatwootUrlRejectionReason =
  | 'invalid_url'
  | 'insecure_scheme'
  | 'private_host'
  | 'not_in_allowlist';

export type ChatwootUrlEvaluation =
  | { ok: true; normalized: string }
  | { ok: false; reason: ChatwootUrlRejectionReason };

/** Permissive policy that preserves the historical block-private-hosts-only behaviour. */
export const PERMISSIVE_CHATWOOT_URL_POLICY: ChatwootUrlPolicy = Object.freeze({
  allowlist: Object.freeze([]),
  requireHttps: false,
});

export function parseChatwootAllowlist(raw: string | undefined): string[] {
  if (raw === undefined) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

export function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '0.0.0.0') return true;
  const ip = isIP(host);
  if (ip === 0) return false;
  if (ip === 4) {
    return (
      host.startsWith('127.') ||
      host.startsWith('10.') ||
      host.startsWith('169.254.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    );
  }
  return (
    host === '::1' ||
    host.startsWith('fc') ||
    host.startsWith('fd') ||
    host.startsWith('fe80:')
  );
}

function matchesAllowlist(
  hostname: string,
  port: string,
  allowlist: readonly string[],
): boolean {
  const host = hostname.toLowerCase();
  const hostPort = port.length > 0 ? `${host}:${port}` : host;
  return allowlist.some((entry) => {
    if (entry.startsWith('.')) {
      return host === entry.slice(1) || host.endsWith(entry);
    }
    return entry === host || entry === hostPort;
  });
}

/**
 * Validate and normalise a Chatwoot `base_url` against {@link ChatwootUrlPolicy}.
 * Returns the trailing-slash-stripped URL on success or a structured rejection
 * reason. Never performs network or DNS I/O.
 */
export function evaluateChatwootBaseUrl(
  value: string,
  policy: ChatwootUrlPolicy,
): ChatwootUrlEvaluation {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'invalid_url' };
  }
  if (policy.requireHttps && url.protocol !== 'https:') {
    return { ok: false, reason: 'insecure_scheme' };
  }
  if (isPrivateHostname(url.hostname)) {
    return { ok: false, reason: 'private_host' };
  }
  if (
    policy.allowlist.length > 0 &&
    !matchesAllowlist(url.hostname, url.port, policy.allowlist)
  ) {
    return { ok: false, reason: 'not_in_allowlist' };
  }
  return { ok: true, normalized: url.toString().replace(/\/+$/, '') };
}

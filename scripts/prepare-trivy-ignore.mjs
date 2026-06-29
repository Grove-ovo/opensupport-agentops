import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const sourcePath = resolve(
  process.env.TRIVY_ALLOWLIST ?? 'security/trivy-allowlist.json',
);
const outputPath = resolve(
  process.env.TRIVY_IGNORE_OUTPUT ?? 'tmp/.trivyignore',
);
const document = JSON.parse(readFileSync(sourcePath, 'utf8'));
if (document.schema_version !== 1 || !Array.isArray(document.entries)) {
  throw new Error('invalid_trivy_allowlist_schema');
}
const today = new Date().toISOString().slice(0, 10);
const ids = new Set();
for (const entry of document.entries) {
  if (
    typeof entry.id !== 'string' ||
    !/^CVE-\d{4}-\d{4,}$/u.test(entry.id) ||
    typeof entry.owner !== 'string' ||
    entry.owner.trim().length === 0 ||
    typeof entry.reason !== 'string' ||
    entry.reason.trim().length < 10 ||
    typeof entry.expires_on !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(entry.expires_on)
  ) {
    throw new Error('invalid_trivy_allowlist_entry');
  }
  if (entry.expires_on < today) {
    throw new Error(`expired_trivy_allowlist_entry:${entry.id}`);
  }
  if (ids.has(entry.id)) {
    throw new Error(`duplicate_trivy_allowlist_entry:${entry.id}`);
  }
  ids.add(entry.id);
}
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${[...ids].sort().join('\n')}${ids.size ? '\n' : ''}`, {
  mode: 0o600,
});
process.stdout.write(`${JSON.stringify({
  status: 'valid',
  entries: ids.size,
  output: outputPath,
})}\n`);

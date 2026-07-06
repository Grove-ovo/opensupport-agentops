import { readFileSync } from 'node:fs';

const localeFiles = {
  en: 'apps/web/src/locales/en.ts',
  zh: 'apps/web/src/locales/zh.ts',
};

function extractEntries(locale, filePath) {
  const source = readFileSync(filePath, 'utf8');
  const entries = [];
  const keyCounts = new Map();
  const entryPattern = /^\s*'([^']+)'\s*:\s*'((?:\\'|[^'])*)'/gm;
  let match;

  while ((match = entryPattern.exec(source)) !== null) {
    const key = match[1];
    const value = match[2];
    entries.push({ key, value });
    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
  }

  if (entries.length === 0) {
    throw new Error(`${locale}: no locale entries found in ${filePath}`);
  }

  return { entries, keyCounts };
}

function placeholders(value) {
  return Array.from(value.matchAll(/\{([a-zA-Z0-9_.-]+)\}/g), (match) => match[1]).sort();
}

function compareArrays(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

const parsed = Object.fromEntries(
  Object.entries(localeFiles).map(([locale, filePath]) => [locale, extractEntries(locale, filePath)]),
);

const failures = [];

for (const [locale, { keyCounts }] of Object.entries(parsed)) {
  for (const [key, count] of keyCounts.entries()) {
    if (count > 1) {
      failures.push(`${locale}: duplicate locale key "${key}" appears ${count} times`);
    }
  }
}

const enMap = new Map(parsed.en.entries.map((entry) => [entry.key, entry.value]));
const zhMap = new Map(parsed.zh.entries.map((entry) => [entry.key, entry.value]));
const enKeys = [...enMap.keys()].sort();
const zhKeys = [...zhMap.keys()].sort();

for (const key of enKeys) {
  if (!zhMap.has(key)) {
    failures.push(`zh: missing locale key "${key}"`);
  }
}

for (const key of zhKeys) {
  if (!enMap.has(key)) {
    failures.push(`en: missing locale key "${key}"`);
  }
}

for (const key of enKeys) {
  if (!zhMap.has(key)) {
    continue;
  }

  const enPlaceholders = placeholders(enMap.get(key));
  const zhPlaceholders = placeholders(zhMap.get(key));
  if (!compareArrays(enPlaceholders, zhPlaceholders)) {
    failures.push(
      `placeholder mismatch for "${key}": en={${enPlaceholders.join(',')}} zh={${zhPlaceholders.join(',')}}`,
    );
  }
}

if (failures.length > 0) {
  console.error('Web locale parity validation failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Web locale parity validation passed: en ${enKeys.length}, zh ${zhKeys.length}`);

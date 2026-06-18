import { randomUUID } from 'node:crypto';
import type {
  PIICategory,
  PIIMaskOperation,
  PIIReplacement,
} from '@opensupport/shared';
import type { MaskPIIOptions } from './types.js';

interface Range {
  start: number;
  end: number;
}

interface Candidate extends Range {
  category: PIICategory;
  value: string;
  priority: number;
}

const CATEGORY_LABELS: Record<PIICategory, string> = {
  email: 'EMAIL',
  phone: 'PHONE',
  address: 'ADDRESS',
  id_number: 'ID_NUMBER',
  bank_card: 'BANK_CARD',
};

const EMAIL_PATTERN =
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b/giu;
const CHINA_PHONE_PATTERN =
  /(?<!\d)(?:\+?86[\s.-]?)?1[3-9]\d{9}(?!\d)/gu;
const US_PHONE_PATTERN =
  /(?<!\w)(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}(?!\d)/gu;
const INTERNATIONAL_PHONE_PATTERN =
  /(?<!\d)\+\d{1,3}(?:[\s.-]?\d){7,14}(?!\d)/gu;
const SSN_PATTERN = /(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)/gu;
const CHINA_ID_PATTERN = /(?<!\d)(?:\d{17}[\dXx]|\d{15})(?!\d)/gu;
const BANK_CARD_PATTERN = /(?<!\d)(?:\d[\s-]?){12,18}\d(?!\d)/gu;
const LABELLED_ADDRESS_PATTERN =
  /(?:shipping\s+address|billing\s+address|address|收货地址|地址)\s*[:：]\s*([^\n;；]{5,120})/giu;
const ENGLISH_ADDRESS_PATTERN =
  /\b\d{1,6}\s+[A-Z0-9.'-]+(?:\s+[A-Z0-9.'-]+){0,5}\s+(?:STREET|ST|ROAD|RD|AVENUE|AVE|BOULEVARD|BLVD|LANE|LN|DRIVE|DR|WAY)\b(?:[,\s]+[A-Z0-9.'-]+){0,6}/giu;
const CHINESE_ADDRESS_PATTERN =
  /(?:[\u4e00-\u9fff]{2,8}(?:省|自治区))?(?:[\u4e00-\u9fff]{2,8}市)?(?:[\u4e00-\u9fff]{2,8}(?:区|县))[\u4e00-\u9fff0-9A-Za-z-]{2,30}(?:路|街|道|巷|弄)[\u4e00-\u9fff0-9A-Za-z-]{0,20}(?:号|室)?/gu;
const ORDER_ID_PATTERN =
  /(?:order\s*(?:id|number|no\.?)|订单(?:号|编号))\s*[:：#]?\s*([A-Z0-9][A-Z0-9_-]{5,39})/giu;

export function maskPII(
  text: string,
  options: MaskPIIOptions = {},
): PIIMaskOperation {
  const protectedRanges = findProtectedRanges(text, options.preserveValues ?? []);
  const candidates = [
    ...findAddresses(text),
    ...findEmails(text),
    ...findGovernmentIds(text),
    ...findBankCards(text),
    ...findPhones(text),
  ]
    .flatMap((candidate) =>
      candidate.category === 'address'
        ? subtractProtectedRanges(candidate, protectedRanges)
        : overlapsAny(candidate, protectedRanges)
          ? []
          : [candidate],
    )
    .filter((candidate) => candidate.value.length > 0);

  const accepted = resolveOverlaps(candidates);
  if (accepted.length === 0) {
    return {
      result: {
        masked_text: text,
        detected_categories: [],
        replacement_map_ref: null,
      },
      replacements: [],
    };
  }

  const counters = new Map<PIICategory, number>();
  const placeholders = new Map<string, string>();
  const replacements: PIIReplacement[] = [];
  const replacementCandidates = accepted.map((candidate) => {
    const key = `${candidate.category}\u0000${candidate.value}`;
    let placeholder = placeholders.get(key);

    if (placeholder === undefined) {
      const next = (counters.get(candidate.category) ?? 0) + 1;
      counters.set(candidate.category, next);
      placeholder = `[${CATEGORY_LABELS[candidate.category]}_${next}]`;
      placeholders.set(key, placeholder);
      replacements.push({
        placeholder,
        category: candidate.category,
        original_value: candidate.value,
      });
    }

    return { ...candidate, placeholder };
  });

  let maskedText = text;
  for (const candidate of [...replacementCandidates].reverse()) {
    maskedText =
      maskedText.slice(0, candidate.start) +
      candidate.placeholder +
      maskedText.slice(candidate.end);
  }

  const detectedCategories = Array.from(
    new Set(accepted.map((candidate) => candidate.category)),
  );
  const replacementMapId = normalizeReplacementMapId(
    options.replacementMapId ?? randomUUID(),
  );

  return {
    result: {
      masked_text: maskedText,
      detected_categories: detectedCategories,
      replacement_map_ref: `pii-map:${replacementMapId}`,
    },
    replacements,
  };
}

function findProtectedRanges(
  text: string,
  preserveValues: readonly string[],
): Range[] {
  const ranges: Range[] = [];

  for (const rawValue of preserveValues) {
    const value = rawValue.trim();
    if (value.length === 0) {
      continue;
    }

    let start = text.indexOf(value);
    while (start !== -1) {
      ranges.push({ start, end: start + value.length });
      start = text.indexOf(value, start + value.length);
    }
  }

  for (const match of text.matchAll(ORDER_ID_PATTERN)) {
    const value = match[1];
    if (value === undefined || match.index === undefined) {
      continue;
    }
    const relativeStart = match[0].lastIndexOf(value);
    ranges.push({
      start: match.index + relativeStart,
      end: match.index + relativeStart + value.length,
    });
  }

  return mergeRanges(ranges);
}

function findEmails(text: string): Candidate[] {
  return regexCandidates(text, EMAIL_PATTERN, 'email', 20);
}

function findPhones(text: string): Candidate[] {
  return [
    ...regexCandidates(text, CHINA_PHONE_PATTERN, 'phone', 50),
    ...regexCandidates(text, US_PHONE_PATTERN, 'phone', 50),
    ...regexCandidates(text, INTERNATIONAL_PHONE_PATTERN, 'phone', 50),
  ];
}

function findGovernmentIds(text: string): Candidate[] {
  return [
    ...regexCandidates(text, SSN_PATTERN, 'id_number', 30),
    ...regexCandidates(text, CHINA_ID_PATTERN, 'id_number', 30).filter(
      (candidate) => isValidChineseCitizenId(candidate.value),
    ),
  ];
}

function findBankCards(text: string): Candidate[] {
  return regexCandidates(text, BANK_CARD_PATTERN, 'bank_card', 40).filter(
    (candidate) => {
      const digits = candidate.value.replace(/\D/g, '');
      return digits.length >= 13 && digits.length <= 19 && passesLuhn(digits);
    },
  );
}

function findAddresses(text: string): Candidate[] {
  const labelled: Candidate[] = [];
  for (const match of text.matchAll(LABELLED_ADDRESS_PATTERN)) {
    const value = match[1];
    if (value === undefined || match.index === undefined) {
      continue;
    }
    const relativeStart = match[0].lastIndexOf(value);
    labelled.push({
      start: match.index + relativeStart,
      end: match.index + relativeStart + value.length,
      value,
      category: 'address',
      priority: 10,
    });
  }

  return [
    ...labelled,
    ...regexCandidates(text, ENGLISH_ADDRESS_PATTERN, 'address', 10),
    ...regexCandidates(text, CHINESE_ADDRESS_PATTERN, 'address', 10),
  ];
}

function regexCandidates(
  text: string,
  pattern: RegExp,
  category: PIICategory,
  priority: number,
): Candidate[] {
  return Array.from(text.matchAll(pattern), (match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
    value: match[0],
    category,
    priority,
  }));
}

function resolveOverlaps(candidates: Candidate[]): Candidate[] {
  const accepted: Candidate[] = [];
  const unique = new Map<string, Candidate>();

  for (const candidate of candidates) {
    unique.set(
      `${candidate.start}:${candidate.end}:${candidate.category}`,
      candidate,
    );
  }

  const prioritized = Array.from(unique.values()).sort(
    (left, right) =>
      left.priority - right.priority ||
      left.start - right.start ||
      right.end - left.end,
  );

  for (const candidate of prioritized) {
    if (!overlapsAny(candidate, accepted)) {
      accepted.push(candidate);
    }
  }

  return accepted.sort((left, right) => left.start - right.start);
}

function subtractProtectedRanges(
  candidate: Candidate,
  protectedRanges: readonly Range[],
): Candidate[] {
  let segments: Range[] = [{ start: candidate.start, end: candidate.end }];

  for (const protectedRange of protectedRanges) {
    segments = segments.flatMap((segment) => subtractRange(segment, protectedRange));
  }

  return segments
    .map((segment) => trimSegment(candidate, segment))
    .filter((segment): segment is Candidate => segment !== null);
}

function subtractRange(segment: Range, protectedRange: Range): Range[] {
  if (!overlaps(segment, protectedRange)) {
    return [segment];
  }

  const ranges: Range[] = [];
  if (segment.start < protectedRange.start) {
    ranges.push({ start: segment.start, end: protectedRange.start });
  }
  if (protectedRange.end < segment.end) {
    ranges.push({ start: protectedRange.end, end: segment.end });
  }
  return ranges;
}

function trimSegment(
  candidate: Candidate,
  segment: Range,
): Candidate | null {
  const raw = candidate.value.slice(
    segment.start - candidate.start,
    segment.end - candidate.start,
  );
  const leading = raw.length - raw.trimStart().length;
  const trailing = raw.length - raw.trimEnd().length;
  const start = segment.start + leading;
  const end = segment.end - trailing;
  const value = candidate.value.slice(
    start - candidate.start,
    end - candidate.start,
  );

  if (value.replace(/[,，:\s]/g, '').length < 3) {
    return null;
  }

  return { ...candidate, start, end, value };
}

function mergeRanges(ranges: Range[]): Range[] {
  const sorted = ranges
    .filter((range) => range.start < range.end)
    .sort((left, right) => left.start - right.start);
  const merged: Range[] = [];

  for (const range of sorted) {
    const previous = merged.at(-1);
    if (previous !== undefined && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }

  return merged;
}

function overlapsAny(range: Range, ranges: readonly Range[]): boolean {
  return ranges.some((candidate) => overlaps(range, candidate));
}

function overlaps(left: Range, right: Range): boolean {
  return left.start < right.end && right.start < left.end;
}

function passesLuhn(digits: string): boolean {
  let sum = 0;
  let doubleDigit = false;

  for (let index = digits.length - 1; index >= 0; index -= 1) {
    const digit = Number(digits[index]);
    let value = digit;
    if (doubleDigit) {
      value *= 2;
      if (value > 9) {
        value -= 9;
      }
    }
    sum += value;
    doubleDigit = !doubleDigit;
  }

  return sum % 10 === 0;
}

function isValidChineseCitizenId(value: string): boolean {
  if (/^\d{15}$/.test(value)) {
    return isValidDate(`19${value.slice(6, 12)}`);
  }

  if (!/^\d{17}[\dXx]$/.test(value) || !isValidDate(value.slice(6, 14))) {
    return false;
  }

  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checks = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
  const sum = weights.reduce(
    (total, weight, index) => total + Number(value[index]) * weight,
    0,
  );

  return checks[sum % 11] === value.at(-1)?.toUpperCase();
}

function isValidDate(compact: string): boolean {
  if (!/^\d{8}$/.test(compact)) {
    return false;
  }

  const year = Number(compact.slice(0, 4));
  const month = Number(compact.slice(4, 6));
  const day = Number(compact.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function normalizeReplacementMapId(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(normalized)) {
    throw new TypeError('replacementMapId must be a safe opaque identifier');
  }
  return normalized;
}

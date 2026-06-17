import type { RequestHeaders } from './types.js';

export function getHeader(headers: RequestHeaders, name: string): string | undefined {
  const target = name.toLowerCase();

  for (const [headerName, value] of Object.entries(headers)) {
    if (headerName.toLowerCase() !== target) {
      continue;
    }

    if (Array.isArray(value)) {
      return value[0];
    }

    return typeof value === 'string' ? value : undefined;
  }

  return undefined;
}

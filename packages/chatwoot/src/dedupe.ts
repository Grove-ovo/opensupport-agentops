import type { DedupeStore } from './types.js';

export class MemoryDedupeStore implements DedupeStore {
  readonly #keys = new Set<string>();

  has(key: string): boolean {
    return this.#keys.has(key);
  }

  add(key: string): void {
    this.#keys.add(key);
  }
}

export async function claimDedupeKeys(store: DedupeStore, keys: readonly string[]): Promise<boolean> {
  const uniqueKeys = [...new Set(keys.filter(Boolean))];

  for (const key of uniqueKeys) {
    if (await store.has(key)) {
      return false;
    }
  }

  for (const key of uniqueKeys) {
    await store.add(key);
  }

  return true;
}

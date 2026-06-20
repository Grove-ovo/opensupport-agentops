import type { DedupeStore } from './types.js';

export class MemoryDedupeStore implements DedupeStore {
  readonly #keys = new Set<string>();

  claim(keys: readonly string[]): boolean {
    if (keys.some((key) => this.#keys.has(key))) {
      return false;
    }

    for (const key of keys) {
      this.#keys.add(key);
    }

    return true;
  }
}

export async function claimDedupeKeys(store: DedupeStore, keys: readonly string[]): Promise<boolean> {
  const uniqueKeys = [...new Set(keys.filter(Boolean))];
  return store.claim(uniqueKeys);
}

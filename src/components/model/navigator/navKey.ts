import type { Key } from '@react-types/shared';

import { parseKey } from './navUtils';

/**
 * Helpers for navigator key handling.
 * Centralizing this reduces the chance of subtle multi-select / DnD bugs if key formats evolve.
 */
export function isElementKey(key: Key | string | null | undefined): boolean {
  const k = String(key ?? '');
  return k.startsWith('element:');
}

export function elementKey(elementId: string): string {
  return `element:${elementId}`;
}

export function elementIdFromKey(key: Key | string | null | undefined): string | null {
  const parsed = parseKey(String(key ?? ''));
  return parsed && parsed.kind === 'element' ? parsed.id : null;
}

export function elementIdsFromKeys(keys: Iterable<Key | string>): string[] {
  const out: string[] = [];
  for (const k of keys) {
    const id = elementIdFromKey(k);
    if (id) out.push(id);
  }
  return out;
}

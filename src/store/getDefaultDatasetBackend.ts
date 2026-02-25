import type { DatasetBackend } from './datasetBackend';
import { LocalStorageDatasetBackend } from './backends/localStorageDatasetBackend';
import { IndexedDbBackend } from './datasets/local/IndexedDbBackend';

/**
 * Central place to choose the default dataset backend.
 *
 * In later steps this may be configured (e.g., IndexedDB vs remote).
 */
export function getDefaultDatasetBackend(): DatasetBackend {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g: any = typeof globalThis !== 'undefined' ? globalThis : undefined;
  if (g?.indexedDB) {
    return new IndexedDbBackend();
  }
  // Fallback for environments without IndexedDB (or heavily restricted modes).
  return new LocalStorageDatasetBackend();
}

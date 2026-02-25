import type { DatasetId } from './datasetTypes';
import { DEFAULT_LOCAL_DATASET_ID } from './datasetTypes';
import { loadPersistedStoreState, STORAGE_KEY as LEGACY_STORE_STORAGE_KEY } from './storePersistence';

export const DATASET_REGISTRY_STORAGE_KEY = 'pwa-modeller:datasetRegistry:v1';

export type DatasetRegistryEntry = {
  datasetId: DatasetId;
  name: string;
  createdAt: number;
  updatedAt: number;
};

export type DatasetRegistry = {
  v: 1;
  activeDatasetId: DatasetId;
  entries: DatasetRegistryEntry[];
};

function hasLocalStorage(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isRegistryEntry(v: unknown): v is DatasetRegistryEntry {
  if (!isRecord(v)) return false;
  return typeof v['datasetId'] === 'string' && typeof v['name'] === 'string' && typeof v['createdAt'] === 'number' && typeof v['updatedAt'] === 'number';
}

function isRegistry(v: unknown): v is DatasetRegistry {
  if (!isRecord(v)) return false;
  if (v['v'] !== 1) return false;
  if (typeof v['activeDatasetId'] !== 'string') return false;
  const entries = v['entries'];
  if (!Array.isArray(entries)) return false;
  return entries.every(isRegistryEntry);
}

export function loadDatasetRegistry(): DatasetRegistry | null {
  if (!hasLocalStorage()) return null;
  const raw = window.localStorage.getItem(DATASET_REGISTRY_STORAGE_KEY);
  if (!raw) return null;

  const parsed = safeParse(raw);
  if (!isRegistry(parsed)) return null;

  return parsed;
}

export function persistDatasetRegistry(registry: DatasetRegistry): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(DATASET_REGISTRY_STORAGE_KEY, JSON.stringify(registry));
  } catch {
    // ignore quota/private mode
  }
}

/**
 * Ensures a dataset registry exists.
 *
 * Step 3 migration: if the legacy single-model store key exists
 * (pwa-modeller:storeState:v2) but there is no dataset registry yet,
 * create a registry with a single default local dataset entry.
 *
 * NOTE: We intentionally keep the legacy storage key because Step 2 still
 * uses it as the backing store. Later steps will move payload storage to
 * IndexedDB.
 */
export function ensureDatasetRegistryMigrated(): DatasetRegistry {
  const existing = loadDatasetRegistry();
  if (existing) return existing;

  const now = Date.now();

  let name = 'Local model';
  if (hasLocalStorage()) {
    // If legacy state exists, prefer its fileName as a human-friendly dataset name.
    const legacyRaw = window.localStorage.getItem(LEGACY_STORE_STORAGE_KEY);
    if (legacyRaw) {
      const restored = loadPersistedStoreState();
      if (restored?.fileName) name = restored.fileName;
    }
  }

  const registry: DatasetRegistry = {
    v: 1,
    activeDatasetId: DEFAULT_LOCAL_DATASET_ID,
    entries: [
      {
        datasetId: DEFAULT_LOCAL_DATASET_ID,
        name,
        createdAt: now,
        updatedAt: now
      }
    ]
  };

  persistDatasetRegistry(registry);
  return registry;
}

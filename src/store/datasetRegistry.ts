import type { DatasetId, DatasetStorageKind } from './datasetTypes';
import { DEFAULT_LOCAL_DATASET_ID } from './datasetTypes';
import { loadPersistedStoreState, STORAGE_KEY as LEGACY_STORE_STORAGE_KEY } from './storePersistence';

function isRemoteDatasetId(datasetId: DatasetId): boolean {
  return String(datasetId).startsWith('remote:');
}

export const DATASET_REGISTRY_STORAGE_KEY = 'pwa-modeller:datasetRegistry:v1';

/**
 * Storage scope: USER-SCOPED (local-only)
 *
 * The registry is a small local index of locally available datasets and the last active dataset.
 * In a future server-backed mode, this registry may also store remote dataset references, but it
 * remains user/device-specific and is not part of a dataset snapshot.
 */

export type DatasetRegistryEntry = {
  datasetId: DatasetId;
  /** Storage kind for the dataset reference. Defaults to 'local'. */
  storageKind?: DatasetStorageKind;
  /**
   * Remote dataset reference (USER-SCOPED, local-only).
   *
   * Present when storageKind === 'remote'.
   */
  remote?: {
    /** Base URL for the server, e.g. http://localhost:8081 */
    baseUrl: string;
    /** Server-side dataset id (UUID string). */
    serverDatasetId: string;
    /** Optional display name (can differ from local entry name). */
    displayName?: string;
  };
  name: string;
  createdAt: number;
  updatedAt: number;
  /** Updated when the dataset is opened (best-effort; local-only). */
  lastOpenedAt?: number;
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
  if (!(typeof v['datasetId'] === 'string' && typeof v['name'] === 'string' && typeof v['createdAt'] === 'number' && typeof v['updatedAt'] === 'number')) return false;

  const sk = v['storageKind'];
  if (typeof sk !== 'undefined' && sk !== 'local' && sk !== 'remote') return false;

  // Remote reference validation (best-effort, fail closed).
  const remote = v['remote'];
  if (sk === 'remote') {
    if (!isRecord(remote)) return false;
    if (typeof remote['baseUrl'] !== 'string' || typeof remote['serverDatasetId'] !== 'string') return false;
    if (typeof remote['displayName'] !== 'undefined' && typeof remote['displayName'] !== 'string') return false;
  } else {
    // If explicitly local (or missing kind), remote must be absent or nullish.
    if (typeof remote !== 'undefined' && remote !== null) return false;
  }

  const lo = v['lastOpenedAt'];
  if (typeof lo === 'undefined') return true;
  return typeof lo === 'number';
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
        storageKind: 'local',
        name,
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now
      }
    ]
  };

  persistDatasetRegistry(registry);
  return registry;
}


export function listRegistryDatasets(registry?: DatasetRegistry | null): DatasetRegistryEntry[] {
  const r = registry ?? loadDatasetRegistry();
  if (!r) return [];
  // Deterministic order: most recently opened/updated first, then by name.
  return [...r.entries].sort((a, b) => {
    const ao = a.lastOpenedAt ?? 0;
    const bo = b.lastOpenedAt ?? 0;
    if (bo !== ao) return bo - ao;
    if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Returns a registry entry for a dataset id, if present.
 * This is useful for backend routing (local vs remote).
 */
export function getDatasetRegistryEntry(datasetId: DatasetId, registry?: DatasetRegistry | null): DatasetRegistryEntry | null {
  const r = registry ?? loadDatasetRegistry();
  if (!r) return null;
  return r.entries.find(e => e.datasetId === datasetId) ?? null;
}

export function upsertDatasetEntry(entry: DatasetRegistryEntry): DatasetRegistry {
  const existing = loadDatasetRegistry();
  const now = Date.now();

  const base: DatasetRegistry = existing ?? {
    v: 1,
    activeDatasetId: entry.datasetId,
    entries: []
  };

  const entries = base.entries.filter(e => e.datasetId !== entry.datasetId);
  entries.push({ ...entry, storageKind: entry.storageKind ?? 'local', updatedAt: entry.updatedAt ?? now });

  const next: DatasetRegistry = {
    ...base,
    entries
  };
  persistDatasetRegistry(next);
  return next;
}

export function setActiveDataset(datasetId: DatasetId): DatasetRegistry {
  const existing = ensureDatasetRegistryMigrated();
  const now = Date.now();

  const entries = existing.entries.map(e => {
    if (e.datasetId !== datasetId) return e;
    return { ...e, updatedAt: now, lastOpenedAt: now };
  });

  // If datasetId isn't present, add a minimal entry (local only).
  // Remote datasets are intentionally NOT stored in the local registry; they belong in a “recently used” concept instead.
  if (!entries.some(e => e.datasetId === datasetId) && !isRemoteDatasetId(datasetId)) {
    entries.push({
      datasetId,
      storageKind: 'local',
      name: 'Local model',
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now
    });
  }

  const next: DatasetRegistry = {
    ...existing,
    activeDatasetId: datasetId,
    entries
  };
  persistDatasetRegistry(next);
  return next;
}

export function renameDatasetInRegistry(datasetId: DatasetId, name: string): DatasetRegistry {
  const existing = ensureDatasetRegistryMigrated();
  const now = Date.now();
  const entries = existing.entries.map(e => (e.datasetId === datasetId ? { ...e, name, updatedAt: now } : e));
  const next: DatasetRegistry = { ...existing, entries };
  persistDatasetRegistry(next);
  return next;
}

export function removeDatasetEntry(datasetId: DatasetId): DatasetRegistry {
  const existing = ensureDatasetRegistryMigrated();
  const entries = existing.entries.filter(e => e.datasetId !== datasetId);
  const nextActive = existing.activeDatasetId === datasetId ? (entries[0]?.datasetId ?? DEFAULT_LOCAL_DATASET_ID) : existing.activeDatasetId;

  const next: DatasetRegistry = {
    ...existing,
    activeDatasetId: nextActive,
    entries
  };
  // Ensure we always have at least the default entry.
  if (next.entries.length === 0) {
    const now = Date.now();
    next.entries.push({ datasetId: DEFAULT_LOCAL_DATASET_ID, storageKind: 'local', name: 'Local model', createdAt: now, updatedAt: now, lastOpenedAt: now });
  }
  persistDatasetRegistry(next);
  return next;
}

import type { OverlayStoreEntry } from './OverlayStore';

const STORAGE_PREFIX = 'pwa-modeller:overlayState:v1:';

export type OverlayPersistedEnvelopeV1 = {
  v: 1;
  signature: string;
  savedAt: string;
  entries: OverlayStoreEntry[];
};

export type OverlayPersistedMeta = {
  signature: string;
  savedAt: string;
  entryCount: number;
};

/** Load only envelope metadata (savedAt, entryCount) for status displays. */
export function loadPersistedOverlayMeta(signature: string): OverlayPersistedMeta | null {
  if (!hasLocalStorage()) return null;
  const key = overlayStorageKey(signature);
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;

  const parsed = safeParse(raw);
  if (!isRecord(parsed)) return null;
  if (parsed['v'] !== 1) return null;
  if (parsed['signature'] !== signature) return null;

  const savedAt = typeof parsed['savedAt'] === 'string' ? parsed['savedAt'] : '';
  const entries = parsed['entries'];
  const entryCount = Array.isArray(entries) ? entries.length : 0;

  return {
    signature,
    savedAt: savedAt || '',
    entryCount
  };
}

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

export function overlayStorageKey(signature: string): string {
  return `${STORAGE_PREFIX}${signature}`;
}

export function loadPersistedOverlayEntries(signature: string): OverlayStoreEntry[] | null {
  if (!hasLocalStorage()) return null;
  const key = overlayStorageKey(signature);
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;

  const parsed = safeParse(raw);
  if (!isRecord(parsed)) return null;
  if (parsed['v'] !== 1) return null;
  if (parsed['signature'] !== signature) return null;

  const entries = parsed['entries'];
  if (!Array.isArray(entries)) return null;

  // Light shape validation; deeper validation happens on import/export steps.
  const out: OverlayStoreEntry[] = [];
  for (const e of entries) {
    if (!isRecord(e)) continue;
    const entryId = typeof e['entryId'] === 'string' ? e['entryId'] : '';
    const target = e['target'];
    const tags = e['tags'];
    if (!entryId || !isRecord(target) || !isRecord(tags)) continue;

    // Keep as-is; OverlayStore will reindex and we rely on TS types at build-time.
    out.push(e as unknown as OverlayStoreEntry);
  }
  return out;
}

export function persistOverlayEntries(signature: string, entries: OverlayStoreEntry[]): void {
  if (!hasLocalStorage()) return;
  const key = overlayStorageKey(signature);
  const envelope: OverlayPersistedEnvelopeV1 = {
    v: 1,
    signature,
    savedAt: new Date().toISOString(),
    entries
  };
  try {
    window.localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // ignore quota / private mode errors
  }
}

export function clearPersistedOverlay(signature: string): void {
  if (!hasLocalStorage()) return;
  const key = overlayStorageKey(signature);
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

import type { OverlayStoreEntry } from './OverlayStore';
import { OVERLAY_SCHEMA_VERSION } from '../../domain/overlay';

const STORAGE_PREFIX_V1 = 'pwa-modeller:overlayState:v1:';
const STORAGE_PREFIX_V2 = 'pwa-modeller:overlayState:v2:';

export type OverlayPersistedEnvelopeV1 = {
  v: 1;
  signature: string;
  savedAt: string;
  entries: OverlayStoreEntry[];
};

export type OverlayPersistedEnvelopeV2 = {
  v: 2;
  signature: string;
  savedAt: string;
  schemaVersion: number;
  entries: OverlayStoreEntry[];
};

export type OverlayPersistedMeta = {
  signature: string;
  savedAt: string;
  entryCount: number;
};

type OverlayPersistedEnvelopeAny = OverlayPersistedEnvelopeV1 | OverlayPersistedEnvelopeV2;

/** Load only envelope metadata (savedAt, entryCount) for status displays. */
export function loadPersistedOverlayMeta(signature: string): OverlayPersistedMeta | null {
  if (!hasLocalStorage()) return null;
  const env = loadEnvelope(signature);
  if (!env) return null;

  return {
    signature,
    savedAt: env.savedAt || '',
    entryCount: Array.isArray(env.entries) ? env.entries.length : 0
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
  // New writes use v2 key.
  return `${STORAGE_PREFIX_V2}${signature}`;
}

function overlayStorageKeyV1(signature: string): string {
  return `${STORAGE_PREFIX_V1}${signature}`;
}

function overlayStorageKeyV2(signature: string): string {
  return `${STORAGE_PREFIX_V2}${signature}`;
}

function loadEnvelope(signature: string): OverlayPersistedEnvelopeAny | null {
  // Prefer v2, fall back to v1.
  const keys = [overlayStorageKeyV2(signature), overlayStorageKeyV1(signature)];
  for (const key of keys) {
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;
    const parsed = safeParse(raw);
    const env = coerceEnvelope(parsed, signature);
    if (!env) continue;

    // If we loaded from v1, migrate forward to v2 eagerly.
    if (env.v === 1) {
      try {
        persistOverlayEntries(signature, env.entries);
        // Keep the old key around in case the browser blocks writes; best-effort cleanup.
        try {
          window.localStorage.removeItem(key);
        } catch {
          // ignore
        }
      } catch {
        // ignore
      }
    }
    return env;
  }
  return null;
}

function coerceEnvelope(parsed: unknown, signature: string): OverlayPersistedEnvelopeAny | null {
  if (!isRecord(parsed)) return null;
  const v = parsed['v'];
  if (parsed['signature'] !== signature) return null;
  const savedAt = typeof parsed['savedAt'] === 'string' ? parsed['savedAt'] : '';
  const entries = parsed['entries'];
  if (!Array.isArray(entries)) return null;

  if (v === 2) {
    const schemaVersionRaw = parsed['schemaVersion'];
    const schemaVersion = typeof schemaVersionRaw === 'number' && Number.isFinite(schemaVersionRaw) ? schemaVersionRaw : 1;
    return {
      v: 2,
      signature,
      savedAt,
      schemaVersion,
      entries: entries as unknown as OverlayStoreEntry[]
    };
  }

  if (v === 1) {
    return {
      v: 1,
      signature,
      savedAt,
      entries: entries as unknown as OverlayStoreEntry[]
    };
  }

  return null;
}

export function loadPersistedOverlayEntries(signature: string): OverlayStoreEntry[] | null {
  if (!hasLocalStorage()) return null;
  const env = loadEnvelope(signature);
  if (!env) return null;

  const entries = env.entries;

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
  const envelope: OverlayPersistedEnvelopeV2 = {
    v: 2,
    signature,
    savedAt: new Date().toISOString(),
    schemaVersion: OVERLAY_SCHEMA_VERSION,
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
  try {
    window.localStorage.removeItem(overlayStorageKeyV2(signature));
    window.localStorage.removeItem(overlayStorageKeyV1(signature));
  } catch {
    // ignore
  }
}

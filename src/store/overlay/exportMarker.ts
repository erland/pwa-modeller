const STORAGE_PREFIX = 'pwa-modeller:overlayExportMarker:v1:';

export type OverlayExportMarkerV1 = {
  v: 1;
  signature: string;
  exportedAt: string;
  version: number;
};

export type OverlayExportMarker = {
  signature: string;
  exportedAt: string;
  version: number;
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

function markerKey(signature: string): string {
  return `${STORAGE_PREFIX}${signature}`;
}

/**
 * Read the last "exported overlay file" marker for the given model signature.
 *
 * Note: This is distinct from automatic local persistence; it tracks when the user
 * last exported a JSON file from the overlay.
 */
export function loadOverlayExportMarker(signature: string): OverlayExportMarker | null {
  if (!hasLocalStorage()) return null;
  const raw = window.localStorage.getItem(markerKey(signature));
  if (!raw) return null;

  const parsed = safeParse(raw);
  if (!isRecord(parsed)) return null;
  if (parsed['v'] !== 1) return null;
  if (parsed['signature'] !== signature) return null;

  const exportedAt = typeof parsed['exportedAt'] === 'string' ? parsed['exportedAt'] : '';
  const version = typeof parsed['version'] === 'number' ? parsed['version'] : Number(parsed['version']);

  if (!exportedAt || !Number.isFinite(version)) return null;
  return { signature, exportedAt, version };
}

/** Write/update the export marker. */
export function setOverlayExportMarker(signature: string, overlayStoreVersion: number): void {
  if (!hasLocalStorage()) return;
  const env: OverlayExportMarkerV1 = {
    v: 1,
    signature,
    exportedAt: new Date().toISOString(),
    version: overlayStoreVersion
  };
  try {
    window.localStorage.setItem(markerKey(signature), JSON.stringify(env));
  } catch {
    // ignore quota/private mode errors
  }
}

export function clearOverlayExportMarker(signature: string): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.removeItem(markerKey(signature));
  } catch {
    // ignore
  }
}

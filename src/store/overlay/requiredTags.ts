export type OverlayRequiredTagsMeta = {
  tags: string[];
  updatedAt: string; // ISO datetime
};

const REQUIRED_TAGS_STORAGE_PREFIX = 'pwa-modeller.overlay.requiredTags@1:';

function normalizeKey(k: string): string {
  return (k ?? '').toString().trim();
}

function dedupePreserveOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const k = normalizeKey(raw);
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

export function parseRequiredTags(text: string): string[] {
  const parts = (text ?? '').split(/[,\n\r\t;]+/g);
  return dedupePreserveOrder(parts);
}

export function requiredTagsStorageKey(modelSignature: string): string {
  return `${REQUIRED_TAGS_STORAGE_PREFIX}${modelSignature || 'no-model'}`;
}

export function loadRequiredTags(modelSignature: string): OverlayRequiredTagsMeta {
  const key = requiredTagsStorageKey(modelSignature);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { tags: [], updatedAt: new Date(0).toISOString() };
    const parsed = JSON.parse(raw) as Partial<OverlayRequiredTagsMeta>;
    const tags = Array.isArray(parsed.tags) ? parsed.tags.map((t) => String(t)) : [];
    const updatedAt = typeof parsed.updatedAt === 'string' && parsed.updatedAt ? parsed.updatedAt : new Date(0).toISOString();
    return { tags: dedupePreserveOrder(tags), updatedAt };
  } catch {
    return { tags: [], updatedAt: new Date(0).toISOString() };
  }
}

export function saveRequiredTags(modelSignature: string, tags: string[]): void {
  const key = requiredTagsStorageKey(modelSignature);
  const meta: OverlayRequiredTagsMeta = { tags: dedupePreserveOrder(tags), updatedAt: new Date().toISOString() };
  localStorage.setItem(key, JSON.stringify(meta));
}


export function clearRequiredTags(modelSignature: string): void {
  const key = requiredTagsStorageKey(modelSignature);
  localStorage.removeItem(key);
}

// Backwards-compatible simple helpers (string[] only)
export function loadRequiredOverlayTags(modelSignature: string): string[] {
  return loadRequiredTags(modelSignature).tags;
}

export function saveRequiredOverlayTags(modelSignature: string, tags: string[]): void {
  saveRequiredTags(modelSignature, tags);
}

export function clearRequiredOverlayTags(modelSignature: string): void {
  clearRequiredTags(modelSignature);
}

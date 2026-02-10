import type { IRExternalId, IRId } from '../../../framework/ir';

function uniq<T>(arr: T[]): T[] {
  const out: T[] = [];
  const seen = new Set<T>();
  for (const a of arr) {
    if (seen.has(a)) continue;
    seen.add(a);
    out.push(a);
  }
  return out;
}

export function normalizeRefToken(raw: string): string[] {
  const s = (raw ?? '').trim();
  if (!s) return [];

  const out: string[] = [s];
  const lower = s.toLowerCase();
  if (lower !== s) out.push(lower);

  // EA GUIDs are often wrapped in braces: {AAAAAAAA-BBBB-…}
  if (s.startsWith('{') && s.endsWith('}') && s.length > 2) {
    const inner = s.slice(1, -1).trim();
    if (inner) {
      out.push(inner);
      const innerLower = inner.toLowerCase();
      if (innerLower !== inner) out.push(innerLower);
    }
  }

  return uniq(out);
}

function addLookup(map: Map<string, IRId>, token: string, id: IRId): void {
  const t = token.trim();
  if (!t) return;
  if (!map.has(t)) map.set(t, id);
}

export function addLookupVariants(map: Map<string, IRId>, token: string, id: IRId): void {
  for (const v of normalizeRefToken(token)) addLookup(map, v, id);
}

function addExternalIdVariants(map: Map<string, IRId>, externalIds: IRExternalId[] | undefined, id: IRId): void {
  for (const ex of externalIds ?? []) {
    if (!ex?.id) continue;
    addLookupVariants(map, ex.id, id);
  }
}

export function buildElementLookup(elements: { id: IRId; externalIds?: IRExternalId[] }[]): Map<string, IRId> {
  const m = new Map<string, IRId>();
  for (const e of elements) {
    if (!e?.id) continue;
    addLookupVariants(m, e.id, e.id);
    addExternalIdVariants(m, e.externalIds, e.id);
  }
  return m;
}

export function buildRelationshipLookup(relationships: { id: IRId; externalIds?: IRExternalId[] }[]): Map<string, IRId> {
  const m = new Map<string, IRId>();
  for (const r of relationships) {
    if (!r?.id) continue;
    addLookupVariants(m, r.id, r.id);
    addExternalIdVariants(m, r.externalIds, r.id);
  }
  return m;
}

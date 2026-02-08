import type { Model, Relationship } from '../../domain';

export type PortalSearchEntry = {
  /** Internal element id */
  id: string;
  /** Stable external id keys (system[:scope]:id) */
  externalIds?: string[];
  name: string;
  type: string;
  kind?: string;
  layer?: string;
};

export type PortalRelationshipRef = {
  id: string;
  type: string;
  kind?: string;
  sourceId?: string;
  targetId?: string;
};

export type PortalRelationshipGroups = {
  outgoing: Record<string, string[]>; // relType -> relIds
  incoming: Record<string, string[]>; // relType -> relIds
};

export type PortalIndexes = {
  /** Schema version for indexes.json (independent of model schema). */
  schemaVersion: 1;
  /** externalIdKey -> internal element id */
  externalIdIndex: Record<string, string>;
  /** internal element id -> view ids where the element is present as a node */
  usedInViewsIndex: Record<string, string[]>;
  /** internal element id -> grouped rel ids */
  relationshipGroupsIndex: Record<string, PortalRelationshipGroups>;
  /** Minimal search entries; kept small for fast loads */
  searchIndex: PortalSearchEntry[];
};

export function externalIdRefToKey(ref: { system: string; id: string; scope?: string }): string {
  const system = (ref.system ?? '').trim();
  const id = (ref.id ?? '').trim();
  const scope = (ref.scope ?? '').trim();
  if (!system) return id;
  return scope ? `${system}:${scope}:${id}` : `${system}:${id}`;
}

function ensureGroups(obj: Record<string, PortalRelationshipGroups>, elementId: string): PortalRelationshipGroups {
  const existing = obj[elementId];
  if (existing) return existing;
  const created: PortalRelationshipGroups = { outgoing: Object.create(null), incoming: Object.create(null) };
  obj[elementId] = created;
  return created;
}

function pushGrouped(map: Record<string, string[]>, key: string, value: string) {
  const arr = map[key];
  if (arr) arr.push(value);
  else map[key] = [value];
}

export function buildPortalIndexes(model: Model): PortalIndexes {
  const externalIdIndex: Record<string, string> = Object.create(null);
  const usedInViewsIndex: Record<string, string[]> = Object.create(null);
  const relationshipGroupsIndex: Record<string, PortalRelationshipGroups> = Object.create(null);
  const searchIndex: PortalSearchEntry[] = [];

  // Elements
  for (const [id, el] of Object.entries(model.elements ?? {})) {
    const externalIds = (el.externalIds ?? [])
      .map(externalIdRefToKey)
      .filter(Boolean);

    for (const key of externalIds) {
      // First write wins for stability (avoid flapping if duplicates exist)
      if (externalIdIndex[key] == null) externalIdIndex[key] = id;
    }

    searchIndex.push({
      id,
      externalIds: externalIds.length ? externalIds : undefined,
      name: el.name ?? '',
      type: String(el.type ?? ''),
      kind: el.kind,
      layer: (el as any).layer
    });
  }

  // Used-in views
  for (const [viewId, view] of Object.entries(model.views ?? {})) {
    const nodes = view.layout?.nodes ?? [];
    for (const n of nodes) {
      const elementId = n.elementId;
      if (!elementId) continue;
      const arr = usedInViewsIndex[elementId];
      if (arr) {
        if (!arr.includes(viewId)) arr.push(viewId);
      } else {
        usedInViewsIndex[elementId] = [viewId];
      }
    }
  }

  // Relationship groupings (incoming/outgoing, grouped by type)
  for (const [relId, rel] of Object.entries(model.relationships ?? {})) {
    const sourceId = rel.sourceElementId;
    const targetId = rel.targetElementId;
    if (sourceId) {
      const groups = ensureGroups(relationshipGroupsIndex, sourceId);
      pushGrouped(groups.outgoing, String(rel.type ?? 'Unknown'), relId);
    }
    if (targetId) {
      const groups = ensureGroups(relationshipGroupsIndex, targetId);
      pushGrouped(groups.incoming, String(rel.type ?? 'Unknown'), relId);
    }
  }

  // Optional connectors also represent relationships; we include them as well (best-effort)
  for (const [relId, rel] of Object.entries(model.connectors ?? {})) {
    // connectors use source/target as connector endpoints; we only index element endpoints if present.
    const anyRel = rel as unknown as Relationship;
    const sourceId = (anyRel as any).sourceElementId;
    const targetId = (anyRel as any).targetElementId;
    if (sourceId) {
      const groups = ensureGroups(relationshipGroupsIndex, sourceId);
      pushGrouped(groups.outgoing, String((anyRel as any).type ?? 'Unknown'), relId);
    }
    if (targetId) {
      const groups = ensureGroups(relationshipGroupsIndex, targetId);
      pushGrouped(groups.incoming, String((anyRel as any).type ?? 'Unknown'), relId);
    }
  }

  return {
    schemaVersion: 1,
    externalIdIndex,
    usedInViewsIndex,
    relationshipGroupsIndex,
    searchIndex
  };
}

export function isPortalIndexes(value: any): value is PortalIndexes {
  if (!value || typeof value !== 'object') return false;
  if (value.schemaVersion !== 1) return false;
  if (!value.externalIdIndex || typeof value.externalIdIndex !== 'object') return false;
  if (!value.usedInViewsIndex || typeof value.usedInViewsIndex !== 'object') return false;
  if (!value.relationshipGroupsIndex || typeof value.relationshipGroupsIndex !== 'object') return false;
  if (!Array.isArray(value.searchIndex)) return false;
  return true;
}

export type PortalElementFactSheetData = {
  elementId: string;
  element: any;
  externalIdKeys: string[];
  usedInViews: { id: string; name: string; kind: string }[];
  relations: {
    outgoing: { relType: string; relIds: string[]; items: PortalFactSheetRelationItem[] }[];
    incoming: { relType: string; relIds: string[]; items: PortalFactSheetRelationItem[] }[];
  };
  relatedElements: { id: string; name: string; type: string; kind?: string; layer?: string }[];
};

export type PortalFactSheetRelationItem = {
  id: string;
  type: string;
  kind?: string;
  name?: string;
  documentation?: string;
  /** The element on the other side of this relationship (if any). */
  otherElementId?: string;
  otherElementName?: string;
  otherElementType?: string;
  otherElementKind?: string;
  otherElementLayer?: string;
  direction: 'outgoing' | 'incoming';
};

export function resolveElementIdFromExternalId(indexes: PortalIndexes, externalIdKey: string): string | null {
  const key = (externalIdKey ?? '').trim();
  if (!key) return null;
  return indexes.externalIdIndex[key] ?? null;
}

export function getElementFactSheetData(model: Model, indexes: PortalIndexes, elementId: string): PortalElementFactSheetData | null {
  const el = model.elements?.[elementId];
  if (!el) return null;

  const externalIdKeys = (el.externalIds ?? [])
    .map(externalIdRefToKey)
    .filter(Boolean);

  const usedIn = indexes.usedInViewsIndex[elementId] ?? [];
  const usedInViews = usedIn
    .map((viewId) => {
      const v = model.views?.[viewId];
      if (!v) return null;
      return { id: v.id, name: v.name, kind: v.kind };
    })
    .filter(Boolean) as { id: string; name: string; kind: string }[];

  const groups = indexes.relationshipGroupsIndex[elementId] ?? { outgoing: {}, incoming: {} };

  const relatedIds = new Set<string>();

  function expandRel(relId: string, direction: 'outgoing' | 'incoming'): PortalFactSheetRelationItem {
    const rel = (model.relationships?.[relId] ?? model.connectors?.[relId]) as any;
    const type = String(rel?.type ?? 'Unknown');
    const kind = rel?.kind;
    const name = rel?.name;
    const documentation = rel?.documentation;

    const sourceId = rel?.sourceElementId;
    const targetId = rel?.targetElementId;
    const otherId = direction === 'outgoing' ? targetId : sourceId;
    const otherEl = otherId ? (model.elements?.[otherId] as any) : null;
    if (otherId) relatedIds.add(otherId);

    return {
      id: relId,
      type,
      kind,
      name,
      documentation,
      otherElementId: otherId,
      otherElementName: otherEl?.name,
      otherElementType: otherEl ? String(otherEl.type ?? '') : undefined,
      otherElementKind: otherEl?.kind,
      otherElementLayer: otherEl?.layer,
      direction
    };
  }

  const outgoing = Object.entries(groups.outgoing).map(([relType, relIds]) => ({
    relType,
    relIds,
    items: relIds.map((id) => expandRel(id, 'outgoing'))
  }));
  const incoming = Object.entries(groups.incoming).map(([relType, relIds]) => ({
    relType,
    relIds,
    items: relIds.map((id) => expandRel(id, 'incoming'))
  }));

  // Stable ordering for UI
  outgoing.sort((a, b) => a.relType.localeCompare(b.relType));
  incoming.sort((a, b) => a.relType.localeCompare(b.relType));

  return {
    elementId,
    element: el,
    externalIdKeys,
    usedInViews,
    relations: { outgoing, incoming },
    relatedElements: Array.from(relatedIds)
      .map((id) => {
        const e = (model.elements as any)?.[id];
        if (!e) return null;
        return { id, name: e.name, type: String(e.type ?? ''), kind: e.kind, layer: e.layer };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '')) as any
  };
}

export function search(
  indexes: PortalIndexes,
  query: string,
  opts?: { limit?: number; typePrefix?: string }
): PortalSearchEntry[] {
  const q = (query ?? '').trim().toLowerCase();
  const limit = Math.max(1, Math.min(200, opts?.limit ?? 50));

  if (!q) return [];
  const typePrefix = (opts?.typePrefix ?? '').trim().toLowerCase();

  const scored: { score: number; e: PortalSearchEntry }[] = [];
  for (const e of indexes.searchIndex) {
    if (typePrefix && !String(e.type ?? '').toLowerCase().startsWith(typePrefix)) continue;

    const name = (e.name ?? '').toLowerCase();
    const type = (e.type ?? '').toLowerCase();

    let score = 0;
    if (name === q) score += 100;
    if (name.startsWith(q)) score += 50;
    if (name.includes(q)) score += 20;
    if (type.includes(q)) score += 5;

    const exts = e.externalIds ?? [];
    if (exts.some((x) => String(x).toLowerCase() === q)) score += 80;

    if (score > 0) scored.push({ score, e });
  }

  scored.sort((a, b) => b.score - a.score || a.e.name.localeCompare(b.e.name));
  return scored.slice(0, limit).map((x) => x.e);
}

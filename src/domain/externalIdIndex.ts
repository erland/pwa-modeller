import type { Model, HasExternalIds } from './types';
import { dedupeExternalIds, externalKey, normalizeExternalIdRef } from './externalIds';

export type ExternalIdKind = 'element' | 'relationship' | 'view';

export interface ExternalIdDuplicate {
  kind: ExternalIdKind;
  key: string;
  keptInternalId: string;
  droppedInternalId: string;
}

export interface ModelExternalIdIndex {
  elementByKey: Map<string, string>;
  relationshipByKey: Map<string, string>;
  viewByKey: Map<string, string>;
  duplicates: ExternalIdDuplicate[];
}

function keyFromParts(system: string, id: string, scope?: string): string {
  return externalKey({ system, id, scope });
}

function indexRecord(
  kind: ExternalIdKind,
  record: Record<string, HasExternalIds>,
  map: Map<string, string>,
  duplicates: ExternalIdDuplicate[]
): void {
  for (const [internalId, entity] of Object.entries(record)) {
    // We expect sanitized ExternalIdRef[], but we defensively normalize anyway.
    const refs = dedupeExternalIds(entity.externalIds);
    for (const ref of refs) {
      const norm = normalizeExternalIdRef(ref);
      if (!norm) continue;
      const k = externalKey(norm);
      const existing = map.get(k);
      if (!existing) {
        map.set(k, internalId);
      } else if (existing !== internalId) {
        // First one wins; keep deterministic behavior and report the conflict.
        duplicates.push({ kind, key: k, keptInternalId: existing, droppedInternalId: internalId });
      }
    }
  }
}

/** Build an index for resolving internal ids by external ids (for merge-friendly imports). */
export function buildModelExternalIdIndex(model: Model): ModelExternalIdIndex {
  const duplicates: ExternalIdDuplicate[] = [];
  const elementByKey = new Map<string, string>();
  const relationshipByKey = new Map<string, string>();
  const viewByKey = new Map<string, string>();

  indexRecord('element', model.elements, elementByKey, duplicates);
  indexRecord('relationship', model.relationships, relationshipByKey, duplicates);
  indexRecord('view', model.views, viewByKey, duplicates);

  return { elementByKey, relationshipByKey, viewByKey, duplicates };
}

export function resolveElementIdByExternalId(
  index: ModelExternalIdIndex,
  system: string,
  id: string,
  scope?: string
): string | undefined {
  return index.elementByKey.get(keyFromParts(system, id, scope));
}

export function resolveRelationshipIdByExternalId(
  index: ModelExternalIdIndex,
  system: string,
  id: string,
  scope?: string
): string | undefined {
  return index.relationshipByKey.get(keyFromParts(system, id, scope));
}

export function resolveViewIdByExternalId(
  index: ModelExternalIdIndex,
  system: string,
  id: string,
  scope?: string
): string | undefined {
  return index.viewByKey.get(keyFromParts(system, id, scope));
}

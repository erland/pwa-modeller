import type { Model, Element, Relationship, ExternalIdRef } from '../types';
import { dedupeExternalIds, externalKey } from '../externalIds';

export type ModelTargetKind = 'element' | 'relationship';

export interface ModelTargetRef {
  kind: ModelTargetKind;
  id: string;
}

/**
 * Map externalKey -> one or more model targets.
 *
 * We intentionally allow 1:N because overlay resolution needs to detect and
 * report ambiguous matches (multiple targets share the same external key).
 */
export type ModelIndex = Map<string, ModelTargetRef[]>;

export function getExternalRefsForElement(el: Pick<Element, 'externalIds'>): ExternalIdRef[] {
  return dedupeExternalIds(el.externalIds);
}

export function getExternalRefsForRelationship(
  rel: Pick<Relationship, 'externalIds'>
): ExternalIdRef[] {
  return dedupeExternalIds(rel.externalIds);
}

/**
 * Return the subset of a target's external refs whose externalKey uniquely identifies that target.
 *
 * This is useful for "rebind" flows: when an overlay entry is ambiguous (e.g. a shared key),
 * we can attach it using a key that maps to exactly one target in the model.
 *
 * If no unique refs exist, returns an empty array.
 */
export function getUniqueExternalRefsForTarget(model: Model, index: ModelIndex, target: ModelTargetRef): ExternalIdRef[] {
  const refs: ExternalIdRef[] = (() => {
    if (target.kind === 'element') {
      const el = model.elements?.[target.id];
      return el ? getExternalRefsForElement(el) : [];
    }
    const rel = model.relationships?.[target.id];
    return rel ? getExternalRefsForRelationship(rel) : [];
  })();

  const out: ExternalIdRef[] = [];
  for (const r of refs) {
    const k = externalKey(r);
    const candidates = (index.get(k) ?? []).filter((t) => t.kind === target.kind);
    if (candidates.length !== 1) continue;
    const only = candidates[0];
    if (only.id !== target.id) continue;
    out.push(r);
  }
  return out;
}

function upsertTarget(index: ModelIndex, key: string, target: ModelTargetRef): void {
  const list = index.get(key);
  if (!list) {
    index.set(key, [target]);
    return;
  }
  if (list.some((t) => t.kind === target.kind && t.id === target.id)) return;
  list.push(target);
}

/**
 * Build a 1:N external id index across elements and relationships.
 *
 * Deterministic ordering:
 * - iterates element ids and relationship ids sorted lexicographically
 * - for each entity, iterates deduped refs in their preserved order
 */
/**
 * Builds a 1:N index from externalKey -> model targets (elements + relationships).
 *
 * Named differently from the core-domain buildModelExternalIdIndex to avoid
 * export collisions in src/domain/index.ts.
 */
export function buildOverlayModelExternalIdIndex(model: Model): ModelIndex {
  const index: ModelIndex = new Map();

  const elementIds = Object.keys(model.elements ?? {}).sort();
  for (const id of elementIds) {
    const el = model.elements[id];
    if (!el) continue;
    for (const ref of getExternalRefsForElement(el)) {
      upsertTarget(index, externalKey(ref), { kind: 'element', id });
    }
  }

  const relIds = Object.keys(model.relationships ?? {}).sort();
  for (const id of relIds) {
    const rel = model.relationships[id];
    if (!rel) continue;
    for (const ref of getExternalRefsForRelationship(rel)) {
      upsertTarget(index, externalKey(ref), { kind: 'relationship', id });
    }
  }

  return index;
}

export function resolveTargetsByExternalKey(index: ModelIndex, key: string): ModelTargetRef[] {
  return index.get(key) ?? [];
}

export function resolveTargetsByExternalRef(index: ModelIndex, ref: ExternalIdRef): ModelTargetRef[] {
  return resolveTargetsByExternalKey(index, externalKey(ref));
}

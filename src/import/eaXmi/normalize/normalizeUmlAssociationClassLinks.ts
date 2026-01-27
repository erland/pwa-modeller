import type { IRElement, IRRelationship } from '../../framework/ir';
import type { NormalizeEaXmiOptions } from './normalizeEaXmiShared';
import { info } from './normalizeEaXmiShared';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function trimId(v: unknown): string | undefined {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length ? s : undefined;
}

function withAttr(
  attrs: unknown,
  key: string,
  value: string
): Record<string, unknown> {
  const base: Record<string, unknown> = isRecord(attrs) ? { ...attrs } : {};
  base[key] = value;
  return base;
}

const ASSOC_REL_SUFFIX = '__association';

/**
 * EA XMI normalize pass:
 *
 * Ensure a stable model-level linkage between an uml.associationClass element (box)
 * and its materialized UML association relationship (line).
 *
 * This pass operates on IR ids (pre-apply) and stores the linkage on IR attrs:
 * - element.attrs.associationRelationshipId = <relationshipIRId>
 * - relationship.attrs.associationClassElementId = <associationClassElementIRId>
 */
export function normalizeUmlAssociationClassLinks(
  elements: IRElement[],
  relationships: IRRelationship[],
  opts?: NormalizeEaXmiOptions
): { elements: IRElement[]; relationships: IRRelationship[] } {
  if (!elements.length || !relationships.length) return { elements, relationships };

  const associationClassElementIds = new Set(
    elements
      .filter((e) => typeof e?.type === 'string' && e.type === 'uml.associationClass')
      .map((e) => e.id)
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
  );

  if (!associationClassElementIds.size) return { elements, relationships };

  // 1) Identify association relationships that correspond to AssociationClass.
  const assocClassIdToRelId = new Map<string, string>();

  for (const r of relationships) {
    const metaclass = typeof (r?.meta as any)?.metaclass === 'string' ? String((r.meta as any).metaclass) : '';
    const isAssocClassRel = metaclass === 'AssociationClass' || (typeof r?.id === 'string' && r.id.endsWith(ASSOC_REL_SUFFIX));
    if (!isAssocClassRel) continue;

    const relId = typeof r?.id === 'string' ? r.id : '';
    if (!relId) continue;

    // Our parser namespaces AssociationClass relationships as: <assocClassId>__association
    const baseId = relId.endsWith(ASSOC_REL_SUFFIX) ? relId.slice(0, -ASSOC_REL_SUFFIX.length) : undefined;
    if (!baseId) continue;

    if (associationClassElementIds.has(baseId)) {
      assocClassIdToRelId.set(baseId, relId);
    }
  }


  // Prefer explicit link provided by EA connector parsing:
  // relationship.attrs.associationClassElementId = <associationClassElementIRId>
  // (This helps match diagram connector references, which usually point at the EA connector id.)
  for (const r of relationships) {
    const relId = typeof r?.id === 'string' ? r.id : '';
    if (!relId) continue;
    const attrs = (r as any).attrs;
    const assocId = trimId(isRecord(attrs) ? (attrs as any).associationClassElementId : undefined);
    if (!assocId) continue;
    if (!associationClassElementIds.has(assocId)) continue;
    assocClassIdToRelId.set(assocId, relId);
  }

  if (!assocClassIdToRelId.size) return { elements, relationships };


  // 2) Apply relationship.attrs.associationClassElementId
  // - For parser-produced AssociationClass relationships (<assocId>__association), ensure the back-link exists.
  // - For EA connector-derived relationships, ensure the associationClassElementId is set (or normalized).
  const relIdToAssocId = new Map<string, string>();
  for (const [assocId, relId] of assocClassIdToRelId.entries()) {
    relIdToAssocId.set(relId, assocId);
  }

  const nextRelationshipsBase: IRRelationship[] = relationships.map((r) => {
    const relId = typeof r?.id === 'string' ? r.id : '';
    if (!relId) return r;

    const assocFromSuffix = relId.endsWith(ASSOC_REL_SUFFIX) ? relId.slice(0, -ASSOC_REL_SUFFIX.length) : undefined;
    const assocFromMap = relIdToAssocId.get(relId);
    const assocClassId =
      (assocFromSuffix && associationClassElementIds.has(assocFromSuffix) ? assocFromSuffix : undefined) ??
      (assocFromMap && associationClassElementIds.has(assocFromMap) ? assocFromMap : undefined);

    if (!assocClassId) return r;

    const current = r as any;
    const aId = trimId(isRecord(current.attrs) ? (current.attrs as any).associationClassElementId : undefined);
    if (aId === assocClassId) return r;

    return {
      ...r,
      attrs: withAttr((r as any).attrs, 'associationClassElementId', assocClassId)
    };
  });

  // If we have a connector-derived relationship for an AssociationClass, drop the synthetic
  // <assocId>__association relationship to avoid duplicates and to better match diagram connector refs.
  const connectorAssocIds = new Set(
    Array.from(assocClassIdToRelId.entries())
      .filter(([, relId]) => typeof relId === 'string' && !relId.endsWith(ASSOC_REL_SUFFIX))
      .map(([assocId]) => assocId)
  );

  const nextRelationships: IRRelationship[] = connectorAssocIds.size
    ? nextRelationshipsBase.filter((r) => {
        const rid = typeof r?.id === 'string' ? r.id : '';
        if (!rid) return true;
        if (!rid.endsWith(ASSOC_REL_SUFFIX)) return true;
        const baseId = rid.slice(0, -ASSOC_REL_SUFFIX.length);
        return !connectorAssocIds.has(baseId);
      })
    : nextRelationshipsBase;

  const relationshipIdsNormalized = new Set(nextRelationships.map((r) => r.id));

  // 3) Apply element.attrs.associationRelationshipId
  const nextElements: IRElement[] = elements.map((e) => {
    if (e.type !== 'uml.associationClass') return e;
    const relId = assocClassIdToRelId.get(e.id);
    if (!relId) return e;
    if (!relationshipIdsNormalized.has(relId)) return e;

    const current = e as any;
    const existing = trimId((current.attrs as any)?.associationRelationshipId);
    if (existing === relId) return e;

    info(opts, `EA XMI Normalize: Linked AssociationClass ${e.id} -> ${relId}`, {
      code: 'uml-associationclass-link',
      context: { elementId: e.id, relationshipId: relId }
    });

    return {
      ...e,
      attrs: withAttr((e as any).attrs, 'associationRelationshipId', relId)
    };
  });

  return { elements: nextElements, relationships: nextRelationships };
}

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
  const relationshipIds = new Set(relationships.map((r) => r.id));
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

  if (!assocClassIdToRelId.size) return { elements, relationships };

  // 2) Apply relationship.attrs.associationClassElementId
  const nextRelationships: IRRelationship[] = relationships.map((r) => {
    const relId = typeof r?.id === 'string' ? r.id : '';
    if (!relId) return r;
    if (!relId.endsWith(ASSOC_REL_SUFFIX)) return r;

    const assocClassId = relId.slice(0, -ASSOC_REL_SUFFIX.length);
    if (!associationClassElementIds.has(assocClassId)) return r;

    const current = r as any;
    const aId = trimId((current.attrs as any)?.associationClassElementId);
    if (aId === assocClassId) return r;

    return {
      ...r,
      attrs: withAttr((r as any).attrs, 'associationClassElementId', assocClassId)
    };
  });

  // 3) Apply element.attrs.associationRelationshipId
  const nextElements: IRElement[] = elements.map((e) => {
    if (e.type !== 'uml.associationClass') return e;
    const relId = assocClassIdToRelId.get(e.id);
    if (!relId) return e;
    if (!relationshipIds.has(relId)) return e;

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

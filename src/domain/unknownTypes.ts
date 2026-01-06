import type { Element, Relationship, UnknownTypeInfo } from './types';

function normalizeUnknownTypeInfo(info: UnknownTypeInfo | undefined): UnknownTypeInfo {
  const name = (info?.name ?? '').trim();
  const ns = (info?.ns ?? '').trim();
  return {
    name: name.length ? name : 'Unknown',
    ...(ns.length ? { ns } : {})
  };
}

/**
 * Ensures `Element.unknownType` is consistent with `Element.type`.
 *
 * - If type !== 'Unknown' -> unknownType is removed.
 * - If type === 'Unknown' -> unknownType is required and normalized.
 */
export function sanitizeUnknownTypeForElement(el: Element): Element {
  if (el.type !== 'Unknown') {
    return el.unknownType ? { ...el, unknownType: undefined } : el;
  }
  const nextInfo = normalizeUnknownTypeInfo(el.unknownType);
  const changed =
    !el.unknownType ||
    el.unknownType.name !== nextInfo.name ||
    (el.unknownType.ns ?? undefined) !== (nextInfo.ns ?? undefined);
  return changed ? { ...el, unknownType: nextInfo } : el;
}

/**
 * Ensures `Relationship.unknownType` is consistent with `Relationship.type`.
 *
 * - If type !== 'Unknown' -> unknownType is removed.
 * - If type === 'Unknown' -> unknownType is required and normalized.
 */
export function sanitizeUnknownTypeForRelationship(rel: Relationship): Relationship {
  if (rel.type !== 'Unknown') {
    return rel.unknownType ? { ...rel, unknownType: undefined } : rel;
  }
  const nextInfo = normalizeUnknownTypeInfo(rel.unknownType);
  const changed =
    !rel.unknownType ||
    rel.unknownType.name !== nextInfo.name ||
    (rel.unknownType.ns ?? undefined) !== (nextInfo.ns ?? undefined);
  return changed ? { ...rel, unknownType: nextInfo } : rel;
}

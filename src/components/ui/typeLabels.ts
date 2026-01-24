import { getElementTypeLabel, getRelationshipTypeLabel } from '../../domain';
import type { Element, Relationship } from '../../domain';

export function formatElementTypeLabel(el: Pick<Element, 'type' | 'unknownType'> | { type: string; unknownType?: { name?: string } }): string {
  if (el.type === 'Unknown') {
    const n = el.unknownType?.name;
    return n ? `Unknown: ${n}` : 'Unknown';
  }
  return getElementTypeLabel(el.type);
}

export function formatRelationshipTypeLabel(r: Pick<Relationship, 'type' | 'unknownType'> | { type: string; unknownType?: { name?: string } }): string {
  if (r.type === 'Unknown') {
    const n = r.unknownType?.name;
    return n ? `Unknown: ${n}` : 'Unknown';
  }
  return getRelationshipTypeLabel(r.type);
}

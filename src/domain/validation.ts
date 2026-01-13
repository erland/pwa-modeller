import type { Element, Model, Relationship } from './types';

export type ValidationResult = {
  ok: boolean;
  errors: string[];
};

function inferKindFromType(type: string | undefined): 'archimate' | 'uml' | 'bpmn' {
  const t = (type ?? '').trim();
  if (t.startsWith('uml.')) return 'uml';
  if (t.startsWith('bpmn.')) return 'bpmn';
  return 'archimate';
}

export function validateElement(element: Element): ValidationResult {
  const errors: string[] = [];
  if (!element.id) errors.push('Element.id is required');
  if (!element.name || element.name.trim().length === 0) errors.push('Element.name must be non-empty');
  if (!element.type) errors.push('Element.type is required');
  const kind = element.kind ?? inferKindFromType(element.type);
  if (kind === 'archimate' && !element.layer) errors.push('Element.layer is required');
  return { ok: errors.length === 0, errors };
}

export function validateRelationship(rel: Relationship): ValidationResult {
  const errors: string[] = [];
  if (!rel.id) errors.push('Relationship.id is required');
  const hasSrcEl = !!rel.sourceElementId;
  const hasSrcCo = !!rel.sourceConnectorId;
  const hasTgtEl = !!rel.targetElementId;
  const hasTgtCo = !!rel.targetConnectorId;

  if (hasSrcEl === hasSrcCo) errors.push('Relationship must have exactly one source endpoint (element or connector)');
  if (hasTgtEl === hasTgtCo) errors.push('Relationship must have exactly one target endpoint (element or connector)');
  if (!rel.type) errors.push('Relationship.type is required');
  return { ok: errors.length === 0, errors };
}

export function getAllModelIds(model: Model): string[] {
  // View-local objects (notes/labels/group boxes, etc.) still need globally unique ids
  // to avoid collisions in persistence, selection, and future interchange formats.
  const viewObjectIds: string[] = [];
  for (const view of Object.values(model.views)) {
    for (const id of Object.keys(view.objects ?? {})) viewObjectIds.push(id);
  }
  return [
    model.id,
    ...Object.keys(model.elements),
    ...Object.keys(model.relationships),
    ...Object.keys(model.connectors ?? {}),
    ...Object.keys(model.views),
    ...Object.keys(model.folders),
    ...viewObjectIds
  ];
}

export function findDuplicateIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  return Array.from(dupes);
}

/**
 * Basic helper used in unit tests and later store/persistence validation.
 */
export function validateModelIdsUnique(model: Model): { ok: boolean; duplicates: string[] } {
  const duplicates = findDuplicateIds(getAllModelIds(model));
  return { ok: duplicates.length === 0, duplicates };
}

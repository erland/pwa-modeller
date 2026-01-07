import type { Element, Model, Relationship } from './types';

export type ValidationResult = {
  ok: boolean;
  errors: string[];
};

export function validateElement(element: Element): ValidationResult {
  const errors: string[] = [];
  if (!element.id) errors.push('Element.id is required');
  if (!element.name || element.name.trim().length === 0) errors.push('Element.name must be non-empty');
  if (!element.type) errors.push('Element.type is required');
  if (!element.layer) errors.push('Element.layer is required');
  return { ok: errors.length === 0, errors };
}

export function validateRelationship(rel: Relationship): ValidationResult {
  const errors: string[] = [];
  if (!rel.id) errors.push('Relationship.id is required');
  if (!rel.sourceElementId && !rel.sourceConnectorId) errors.push('Relationship source endpoint is required');
  if (!rel.targetElementId && !rel.targetConnectorId) errors.push('Relationship target endpoint is required');
  if (!rel.type) errors.push('Relationship.type is required');
  return { ok: errors.length === 0, errors };
}

export function getAllModelIds(model: Model): string[] {
  return [
    model.id,
    ...Object.keys(model.elements),
    ...Object.keys(model.relationships),
    ...Object.keys(model.views),
    ...Object.keys(model.folders)
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

/**
 * Relationship validation mode:
 * - 'minimal' matches the current simplified rule set used while drawing.
 * - 'full' validates against the ArchiMate relationship tables (core relations only).
 * - 'full_derived' validates against the ArchiMate relationship tables including derived relations.
 */
export type RelationshipValidationMode = 'minimal' | 'full' | 'full_derived';

export const RELATIONSHIP_VALIDATION_MODES: RelationshipValidationMode[] = ['minimal', 'full', 'full_derived'];

export function isFullRelationshipValidationMode(mode: RelationshipValidationMode): boolean {
  return mode === 'full' || mode === 'full_derived';
}

export function includeDerivedRelationships(mode: RelationshipValidationMode): boolean {
  return mode === 'full_derived';
}

/**
 * Best-effort coercion for persisted settings.
 */
export function coerceRelationshipValidationMode(value: unknown): RelationshipValidationMode {
  if (value === 'minimal' || value === 'full' || value === 'full_derived') return value;
  return 'minimal';
}

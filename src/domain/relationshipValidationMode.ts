/**
 * Relationship validation is always strict.
 *
 * The app no longer exposes a "validation mode" switch; we always validate using
 * the ArchiMate relationship tables (including derived relationships when present).
 *
 * The type is kept as a narrow literal for compatibility with the notation guard
 * contract, but there is no longer any runtime choice.
 */

export const STRONGEST_RELATIONSHIP_VALIDATION_MODE = 'full_derived' as const;
export type RelationshipValidationMode = typeof STRONGEST_RELATIONSHIP_VALIDATION_MODE;

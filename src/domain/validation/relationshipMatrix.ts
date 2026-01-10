import type { ElementType, RelationshipType } from '../types';

/**
 * ArchiMate relationship validation based on a concept-to-concept relationship matrix.
 *
 * The matrix is typically sourced from a machine-readable relationship table (e.g. Archi's relationships.xml).
 *
 * This module intentionally does NOT hardcode any 'minimal rules'. It simply parses the matrix and answers:
 *  - which relationship types are allowed between a source concept and a target concept
 *  - whether a specific relationship type is allowed
 *
 * It is designed to be wired into your existing validation layer in later steps.
 */

export type RelationshipMatrixEntry = {
  /** Core relationships allowed per the table. */
  core: Set<RelationshipType>;
  /** Optional derived relationships, if present in the table (often empty). */
  derived: Set<RelationshipType>;
};

/**
 * Matrix keyed by concept name. We keep keys as strings to avoid runtime coupling to the union types.
 * Callers will typically pass ElementType strings.
 */
export type RelationshipMatrix = Map<string, Map<string, RelationshipMatrixEntry>>;

// Relationship-table letters used by Archi (and commonly used to encode the spec tables).
// a,c,f,g,i,n,o,r,s,t,v correspond to specific ArchiMate relationship types.
const LETTER_TO_RELATIONSHIP: Record<string, RelationshipType> = {
  a: 'Access',
  c: 'Composition',
  f: 'Flow',
  g: 'Aggregation',
  i: 'Assignment',
  n: 'Influence',
  o: 'Association',
  r: 'Realization',
  s: 'Specialization',
  t: 'Triggering',
  v: 'Serving'
};

function parseLettersToSet(letters: string | null | undefined): Set<RelationshipType> {
  const out = new Set<RelationshipType>();
  if (!letters) return out;
  for (const ch of letters.trim()) {
    const rel = LETTER_TO_RELATIONSHIP[ch];
    if (rel) out.add(rel);
  }
  return out;
}

/**
 * Parse a relationship table XML string into a RelationshipMatrix.
 *
 * Expected shape:
 * <relationships ...>
 *   <source concept="BusinessProcess">
 *     <target concept="BusinessObject" relations="ao" />
 *   </source>
 * </relationships>
 *
 * The parser is tolerant:
 * - Unknown letters are ignored.
 * - If the XML contains an optional attribute for derived relations (e.g. 'derived' or 'derivedRelations'),
 *   it will be parsed into the `derived` set.
 */
export function parseRelationshipTableXml(xmlText: string): RelationshipMatrix {
  const matrix: RelationshipMatrix = new Map();

  // DOMParser exists in the browser and in Jest's jsdom environment.
  // If it is ever missing, callers can add a fallback parser later.
  if (typeof DOMParser === 'undefined') {
    throw new Error('DOMParser is not available; cannot parse relationship table XML.');
  }

  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');

  // Detect basic parse errors
  const parserErrors = doc.getElementsByTagName('parsererror');
  if (parserErrors && parserErrors.length > 0) {
    const msg = parserErrors[0]?.textContent?.trim() || 'Unknown XML parse error';
    throw new Error(`Failed to parse relationship table XML: ${msg}`);
  }

  const sources = Array.from(doc.getElementsByTagName('source'));
  for (const s of sources) {
    const sourceConcept = s.getAttribute('concept');
    if (!sourceConcept) continue;

    let targetMap = matrix.get(sourceConcept);
    if (!targetMap) {
      targetMap = new Map();
      matrix.set(sourceConcept, targetMap);
    }

    const targets = Array.from(s.getElementsByTagName('target'));
    for (const t of targets) {
      const targetConcept = t.getAttribute('concept');
      if (!targetConcept) continue;

      const relations = t.getAttribute('relations') || t.getAttribute('relation') || '';
      const derived =
        t.getAttribute('derived') ||
        t.getAttribute('derivedRelations') ||
        t.getAttribute('derivedrelations') ||
        '';

      targetMap.set(targetConcept, {
        core: parseLettersToSet(relations),
        derived: parseLettersToSet(derived)
      });
    }
  }

  return matrix;
}

export type MatrixQueryOptions = {
  /** Include derived relationships (if present in the table). Default true. */
  includeDerived?: boolean;
};

const DEFAULT_OPTS: Required<MatrixQueryOptions> = { includeDerived: true };

export function getAllowedRelationshipTypesFromMatrix(
  matrix: RelationshipMatrix,
  sourceType: ElementType,
  targetType: ElementType,
  options: MatrixQueryOptions = DEFAULT_OPTS
): RelationshipType[] {
  const opts = { ...DEFAULT_OPTS, ...options };
  const entry = matrix.get(sourceType)?.get(targetType);
  if (!entry) return [];

  const allowed = new Set<RelationshipType>(entry.core);
  if (opts.includeDerived) {
    for (const r of entry.derived) allowed.add(r);
  }
  return Array.from(allowed);
}

export function isRelationshipAllowedByMatrix(
  matrix: RelationshipMatrix,
  sourceType: ElementType,
  targetType: ElementType,
  relationshipType: RelationshipType,
  options: MatrixQueryOptions = DEFAULT_OPTS
): boolean {
  const allowed = getAllowedRelationshipTypesFromMatrix(matrix, sourceType, targetType, options);
  return allowed.includes(relationshipType);
}

export type RelationshipValidationResult =
  | { allowed: true }
  | { allowed: false; reason: string; allowedTypes: RelationshipType[] };

export function validateRelationshipByMatrix(
  matrix: RelationshipMatrix,
  sourceType: ElementType,
  targetType: ElementType,
  relationshipType: RelationshipType,
  options: MatrixQueryOptions = DEFAULT_OPTS
): RelationshipValidationResult {
  const allowedTypes = getAllowedRelationshipTypesFromMatrix(matrix, sourceType, targetType, options);
  if (allowedTypes.includes(relationshipType)) return { allowed: true };
  return {
    allowed: false,
    reason: `Relationship ${relationshipType} is not allowed from ${sourceType} to ${targetType} according to the relationship table.`,
    allowedTypes
  };
}

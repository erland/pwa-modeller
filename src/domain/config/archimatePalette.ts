import type { ArchimateLayer, ElementType, RelationshipType } from '../types';
import type { RelationshipMatrix } from '../validation/relationshipMatrix';
import { getAllowedRelationshipTypesFromMatrix, parseRelationshipTableXml, validateRelationshipByMatrix } from '../validation/relationshipMatrix';
/**
 * Static configuration used by the Step 6 palette & CRUD UI.
 *
 * This is intentionally a pragmatic subset aligned with the element/relationship
 * types defined in `src/domain/types.ts`.
 */

export const ARCHIMATE_LAYERS: ArchimateLayer[] = [
  'Strategy',
  'Business',
  'Application',
  'Technology',
  'Physical',
  'ImplementationMigration',
  'Motivation'
];

export const ELEMENT_TYPES_BY_LAYER: Record<ArchimateLayer, ElementType[]> = {
  Strategy: ['Capability', 'CourseOfAction', 'Resource', 'Outcome', 'ValueStream'],
  Motivation: ['Stakeholder', 'Driver', 'Assessment', 'Constraint', 'Principle', 'Value', 'Meaning', 'Goal', 'Requirement'],
  Business: [
    'BusinessActor',
    'BusinessRole',
    'BusinessCollaboration',
    'BusinessInterface',
    'BusinessProcess',
    'BusinessFunction',
    'BusinessInteraction',
    'BusinessEvent',
    'BusinessService',
    'BusinessObject',
    'Contract',
    'Representation',
    'Product',
    'Grouping'
  ],
  Application: [
    'ApplicationComponent',
    'ApplicationCollaboration',
    'ApplicationInterface',
    'ApplicationProcess',
    'ApplicationFunction',
    'ApplicationInteraction',
    'ApplicationEvent',
    'ApplicationService',
    'DataObject'
  ],
  Technology: [
    'Node',
    'Device',
    'SystemSoftware',
    'TechnologyCollaboration',
    'TechnologyInterface',
    'TechnologyProcess',
    'TechnologyFunction',
    'TechnologyInteraction',
    'TechnologyEvent',
    'TechnologyService',
    'Path',
    'CommunicationNetwork',
    'Artifact'
  ],
  Physical: ['Facility', 'Equipment', 'DistributionNetwork', 'Material', 'Location'],
  ImplementationMigration: ['WorkPackage', 'ImplementationEvent', 'Deliverable', 'Plateau', 'Gap']
};

export const RELATIONSHIP_TYPES: RelationshipType[] = [
  'Association',
  'Serving',
  'Realization',
  'Flow',
  'Composition',
  'Aggregation',
  'Assignment',
  'Access',
  'Influence',
  'Triggering',
  'Specialization'
];

// ------------------------------
// Relationship rules (fallback heuristic)
// ------------------------------

const SERVICE_TYPES: Set<ElementType> = new Set(['BusinessService', 'ApplicationService', 'TechnologyService']);
const DATA_TYPES: Set<ElementType> = new Set(['DataObject', 'Artifact', 'BusinessObject', 'Representation', 'Contract', 'Material']);

const BUSINESS_BEHAVIOR: Set<ElementType> = new Set(['BusinessProcess', 'BusinessFunction', 'BusinessInteraction', 'BusinessEvent']);
const APPLICATION_BEHAVIOR: Set<ElementType> = new Set(['ApplicationProcess', 'ApplicationFunction', 'ApplicationInteraction', 'ApplicationEvent']);

const BUSINESS_ACTIVE: Set<ElementType> = new Set(['BusinessActor', 'BusinessRole', 'BusinessCollaboration', 'BusinessInterface']);
const APPLICATION_ACTIVE: Set<ElementType> = new Set(['ApplicationComponent', 'ApplicationCollaboration', 'ApplicationInterface']);
const TECHNOLOGY_ACTIVE: Set<ElementType> = new Set(['Node', 'Device', 'SystemSoftware', 'TechnologyCollaboration', 'TechnologyInterface', 'Path', 'CommunicationNetwork']);

const IMPLEMENTATION_ACTIVE: Set<ElementType> = new Set(['WorkPackage']);

export type RelationshipValidation = { allowed: true } | { allowed: false; reason: string };

/**
 * Minimal validation for allowed combinations.
 *
 * NOTE: This is intentionally *not* a full ArchiMate rules engine.
 * It exists to give the UI meaningful feedback in early steps.
 */
function validateRelationshipMinimal(
  sourceType: ElementType,
  targetType: ElementType,
  relationshipType: RelationshipType
): RelationshipValidation {
  // Always allowed: Association + Specialization (kept permissive for now).
  if (relationshipType === 'Association' || relationshipType === 'Specialization') return { allowed: true };

  if (relationshipType === 'Serving') {
    if (!SERVICE_TYPES.has(sourceType)) {
      return { allowed: false, reason: 'Serving relationships must originate from a Service.' };
    }
    return { allowed: true };
  }

  if (relationshipType === 'Realization') {
    // Realization: implementation realizes an abstract/service-ish concept
    const realizable = new Set<ElementType>([
      ...Array.from(SERVICE_TYPES),
      'Capability',
      'CourseOfAction',
      'Requirement',
      'Goal',
      'Deliverable'
    ]);
    const realizers = new Set<ElementType>([
      ...Array.from(BUSINESS_BEHAVIOR),
      ...Array.from(APPLICATION_BEHAVIOR),
      ...Array.from(APPLICATION_ACTIVE),
      ...Array.from(TECHNOLOGY_ACTIVE),
      ...Array.from(IMPLEMENTATION_ACTIVE)
    ]);

    if (!realizers.has(sourceType)) {
      return { allowed: false, reason: 'Realization must originate from a behavior/active structure element.' };
    }
    if (!realizable.has(targetType)) {
      return { allowed: false, reason: 'Realization target must be a Service/abstract concept.' };
    }
    return { allowed: true };
  }

  if (relationshipType === 'Assignment') {
    // Actor/Role assigned to Business behavior; App component assigned to App function; Tech active assigned to Tech service
    if (BUSINESS_ACTIVE.has(sourceType) && BUSINESS_BEHAVIOR.has(targetType)) return { allowed: true };
    if (APPLICATION_ACTIVE.has(sourceType) && APPLICATION_BEHAVIOR.has(targetType)) return { allowed: true };
    if (TECHNOLOGY_ACTIVE.has(sourceType) && targetType === 'TechnologyService') return { allowed: true };
    return {
      allowed: false,
      reason: 'Assignment is only allowed from an active structure element to a behavior element (fallback rule set).'
    };
  }

  if (relationshipType === 'Access') {
    // Behavior/active -> data
    const accessors = new Set<ElementType>([
      ...Array.from(BUSINESS_BEHAVIOR),
      ...Array.from(APPLICATION_BEHAVIOR),
      ...Array.from(APPLICATION_ACTIVE),
      ...Array.from(BUSINESS_ACTIVE),
      ...Array.from(TECHNOLOGY_ACTIVE),
      ...Array.from(IMPLEMENTATION_ACTIVE)
    ]);
    if (!accessors.has(sourceType) || !DATA_TYPES.has(targetType)) {
      return { allowed: false, reason: 'Access is only allowed from behavior/active elements to data objects/artifacts.' };
    }
    return { allowed: true };
  }

  if (relationshipType === 'Triggering') {
    // Common in behavior chains.
    const behaviorish = new Set<ElementType>([
      ...Array.from(BUSINESS_BEHAVIOR),
      ...Array.from(APPLICATION_BEHAVIOR),
      'WorkPackage',
      'ImplementationEvent',
      'ValueStream'
    ]);
    if (!behaviorish.has(sourceType) || !behaviorish.has(targetType)) {
      return { allowed: false, reason: 'Triggering is only allowed between behavior-like elements (fallback rule set).' };
    }
    return { allowed: true };
  }

  if (relationshipType === 'Flow') {
    // Allow between behavior elements and services, and between application components.
    const flowish = new Set<ElementType>([
      ...Array.from(BUSINESS_BEHAVIOR),
      ...Array.from(APPLICATION_BEHAVIOR),
      ...Array.from(APPLICATION_ACTIVE),
      ...Array.from(SERVICE_TYPES)
    ]);
    if (!flowish.has(sourceType) || !flowish.has(targetType)) {
      return { allowed: false, reason: 'Flow is only allowed between behavior/service/component elements (fallback rule set).' };
    }
    return { allowed: true };
  }

  if (relationshipType === 'Influence') {
    const influencers = new Set<ElementType>(['Stakeholder', 'Driver', 'Assessment', 'Constraint', 'Principle', 'Value', 'Meaning', 'Goal', 'Requirement', 'Outcome', 'CourseOfAction', 'ValueStream']);
    if (!influencers.has(sourceType)) {
      return { allowed: false, reason: 'Influence must originate from a motivation/strategy element (fallback rule set).' };
    }
    return { allowed: true };
  }

  if (relationshipType === 'Composition' || relationshipType === 'Aggregation') {
    // Keep permissive: allow within same layer or any service -> data etc.
    return { allowed: true };
  }

  // Default: permissive (keeps early UX flexible).
  return { allowed: true };
}
/**
 * Strict relationship validation.
 *
 * We validate against the ArchiMate relationship table matrix when it has been loaded.
 * If the matrix isn't available (e.g. in some test/runtime contexts), we fall back to
 * a small heuristic "minimal" rule set.
 *
 * Derived relationships from the table are always included when present.
 */
let _relationshipMatrix: RelationshipMatrix | null = null;

function ensureRelationshipMatrix(): RelationshipMatrix | null {
  return _relationshipMatrix;
}

/**
 * Attempt to initialize the relationship matrix from the bundled relationships.xml.
 * Uses a dynamic import with Vite's `?raw` loader.
 * In Jest/Node this may fail; callers should ignore a false result.
 */
export async function initRelationshipValidationMatrixFromBundledTable(): Promise<boolean> {
  if (_relationshipMatrix) return true;
  try {
    const mod: { default: string } = await import('../validation/data/relationships.xml?raw');
    const xmlText: string = (mod && (mod.default ?? mod)) as string;
    initRelationshipValidationMatrixFromXml(xmlText);
    return true;
  } catch {
    return false;
  }
}


/** Provide a pre-parsed relationship matrix (e.g. at app startup). */
export function setRelationshipValidationMatrix(matrix: RelationshipMatrix | null): void {
  _relationshipMatrix = matrix;
}

/** Convenience: parse and store the relationship matrix from the relationships.xml text. */
export function initRelationshipValidationMatrixFromXml(xmlText: string): RelationshipMatrix {
  const m = parseRelationshipTableXml(xmlText);
  _relationshipMatrix = m;
  return m;
}


export function validateRelationship(
  sourceType: ElementType,
  targetType: ElementType,
  relationshipType: RelationshipType
): RelationshipValidation {
  const matrix = ensureRelationshipMatrix();
  if (!matrix) {
    // Fallback when the matrix is not available (e.g. Node/Jest or early app startup).
    return validateRelationshipMinimal(sourceType, targetType, relationshipType);
  }

  const res = validateRelationshipByMatrix(matrix, sourceType, targetType, relationshipType, {
    includeDerived: true
  });

  // The relationship table is largely about *compatibility* between concepts, but a few
  // relationships have directional semantics that we want to keep strict.
  //
  // Example: when a Service is involved, the Service should be the origin of a Serving
  // relationship ("a service serves X").
  if (relationshipType === 'Serving' && SERVICE_TYPES.has(targetType) && !SERVICE_TYPES.has(sourceType)) {
    return { allowed: false, reason: 'Serving relationships must originate from a Service.' };
  }

  if (res.allowed) return { allowed: true };
  return { allowed: false, reason: res.reason };
}

export function isRelationshipAllowed(
  sourceType: ElementType,
  targetType: ElementType,
  relationshipType: RelationshipType
): boolean {
  return validateRelationship(sourceType, targetType, relationshipType).allowed;
}

export function getAllowedRelationshipTypes(sourceType: ElementType, targetType: ElementType): RelationshipType[] {
  const matrix = ensureRelationshipMatrix();
  if (!matrix) {
    return RELATIONSHIP_TYPES.filter((t) => validateRelationshipMinimal(sourceType, targetType, t).allowed);
  }

  const allowed = getAllowedRelationshipTypesFromMatrix(matrix, sourceType, targetType, { includeDerived: true });
  const allowedSet = new Set<RelationshipType>(allowed);
  // Keep deterministic ordering according to our canonical list.
  return RELATIONSHIP_TYPES.filter((t) => allowedSet.has(t));
}

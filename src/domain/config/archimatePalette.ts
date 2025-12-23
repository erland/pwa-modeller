import type { ArchimateLayer, ElementType, RelationshipType } from '../types';

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
  Strategy: ['Capability', 'CourseOfAction', 'Resource', 'Outcome'],
  Motivation: ['Goal', 'Requirement'],
  Business: [
    'BusinessActor',
    'BusinessRole',
    'BusinessProcess',
    'BusinessFunction',
    'BusinessService',
    'Product'
  ],
  Application: ['ApplicationComponent', 'ApplicationFunction', 'ApplicationService', 'DataObject'],
  Technology: ['Node', 'Device', 'SystemSoftware', 'TechnologyService', 'Artifact'],
  Physical: ['Facility', 'Equipment'],
  ImplementationMigration: ['WorkPackage', 'Deliverable', 'Plateau', 'Gap']
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
// Relationship rules (minimal)
// ------------------------------

const SERVICE_TYPES: Set<ElementType> = new Set(['BusinessService', 'ApplicationService', 'TechnologyService']);
const DATA_TYPES: Set<ElementType> = new Set(['DataObject', 'Artifact']);

const BUSINESS_BEHAVIOR: Set<ElementType> = new Set(['BusinessProcess', 'BusinessFunction']);
const APPLICATION_BEHAVIOR: Set<ElementType> = new Set(['ApplicationFunction']);

const BUSINESS_ACTIVE: Set<ElementType> = new Set(['BusinessActor', 'BusinessRole']);
const APPLICATION_ACTIVE: Set<ElementType> = new Set(['ApplicationComponent']);
const TECHNOLOGY_ACTIVE: Set<ElementType> = new Set(['Node', 'Device', 'SystemSoftware']);

const IMPLEMENTATION_ACTIVE: Set<ElementType> = new Set(['WorkPackage']);

export type RelationshipValidation = { allowed: true } | { allowed: false; reason: string };

/**
 * Minimal validation for allowed combinations.
 *
 * NOTE: This is intentionally *not* a full ArchiMate rules engine.
 * It exists to give the UI meaningful feedback in early steps.
 */
export function validateRelationship(
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
      reason: 'Assignment is only allowed from an active structure element to a behavior element (minimal rule set).'
    };
  }

  if (relationshipType === 'Access') {
    // Behavior/active -> data
    const accessors = new Set<ElementType>([
      ...Array.from(BUSINESS_BEHAVIOR),
      ...Array.from(APPLICATION_BEHAVIOR),
      ...Array.from(APPLICATION_ACTIVE)
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
      'WorkPackage'
    ]);
    if (!behaviorish.has(sourceType) || !behaviorish.has(targetType)) {
      return { allowed: false, reason: 'Triggering is only allowed between behavior-like elements (minimal rule set).' };
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
      return { allowed: false, reason: 'Flow is only allowed between behavior/service/component elements (minimal rule set).' };
    }
    return { allowed: true };
  }

  if (relationshipType === 'Influence') {
    const influencers = new Set<ElementType>(['Goal', 'Requirement', 'Outcome', 'CourseOfAction']);
    if (!influencers.has(sourceType)) {
      return { allowed: false, reason: 'Influence must originate from a motivation/strategy element (minimal rule set).' };
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

export function isRelationshipAllowed(sourceType: ElementType, targetType: ElementType, relationshipType: RelationshipType): boolean {
  return validateRelationship(sourceType, targetType, relationshipType).allowed;
}

export function getAllowedRelationshipTypes(sourceType: ElementType, targetType: ElementType): RelationshipType[] {
  return RELATIONSHIP_TYPES.filter((t) => isRelationshipAllowed(sourceType, targetType, t));
}

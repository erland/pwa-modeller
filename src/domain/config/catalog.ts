import type { ArchimateLayer, ElementType, RelationshipType } from '../types';

export const ARCHIMATE_LAYERS: ArchimateLayer[] = [
  'Strategy',
  'Business',
  'Application',
  'Technology',
  'Physical',
  'ImplementationMigration',
  'Motivation'
];

// Keep in sync with `domain/types.ts` union type. This is only a starter subset.
export const ELEMENT_TYPES: ElementType[] = [
  // Strategy / Motivation
  'Capability',
  'CourseOfAction',
  'Resource',
  'Outcome',
  'Goal',
  'Requirement',
  // Business
  'BusinessActor',
  'BusinessRole',
  'BusinessProcess',
  'BusinessFunction',
  'BusinessService',
  'Product',
  // Application
  'ApplicationComponent',
  'ApplicationFunction',
  'ApplicationService',
  'DataObject',
  // Technology / Physical
  'Node',
  'Device',
  'SystemSoftware',
  'TechnologyService',
  'Artifact',
  'Facility',
  'Equipment',
  // Implementation & Migration
  'WorkPackage',
  'Deliverable',
  'Plateau',
  'Gap'
];

export const RELATIONSHIP_TYPES: RelationshipType[] = [
  'Association',
  'Realization',
  'Serving',
  'Flow',
  'Composition',
  'Aggregation',
  'Assignment',
  'Access',
  'Influence',
  'Triggering',
  'Specialization'
];

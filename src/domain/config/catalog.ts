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
  // Strategy
  'Capability',
  'CourseOfAction',
  'Resource',
  'Outcome',
  'ValueStream',
  // Motivation
  'Stakeholder',
  'Driver',
  'Assessment',
  'Constraint',
  'Principle',
  'Value',
  'Meaning',
  'Goal',
  'Requirement',
  // Business
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
  'Grouping',
  // Application
  'ApplicationComponent',
  'ApplicationCollaboration',
  'ApplicationInterface',
  'ApplicationProcess',
  'ApplicationFunction',
  'ApplicationInteraction',
  'ApplicationEvent',
  'ApplicationService',
  'DataObject',
  // Technology
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
  'Artifact',
  // Physical
  'Facility',
  'Equipment',
  'DistributionNetwork',
  'Material',
  'Location',
  // Implementation & Migration
  'WorkPackage',
  'ImplementationEvent',
  'Deliverable',
  'Plateau',
  'Gap'
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

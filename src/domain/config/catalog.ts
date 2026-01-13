import type { ArchimateLayer, ElementType, ModelKind, RelationshipType } from '../types';

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

// -------------------------
// UML (Class diagram v1)
// -------------------------

export const UML_ELEMENT_TYPES: ElementType[] = ['uml.class', 'uml.interface', 'uml.enum', 'uml.package', 'uml.note'];

export const UML_RELATIONSHIP_TYPES: RelationshipType[] = [
  'uml.association',
  'uml.aggregation',
  'uml.composition',
  'uml.generalization',
  'uml.realization',
  'uml.dependency'
];

export function getElementTypesForKind(kind: ModelKind): ElementType[] {
  if (kind === 'uml') return UML_ELEMENT_TYPES;
  // TODO: BPMN
  return ELEMENT_TYPES;
}

export function getRelationshipTypesForKind(kind: ModelKind): RelationshipType[] {
  if (kind === 'uml') return UML_RELATIONSHIP_TYPES;
  // TODO: BPMN
  return RELATIONSHIP_TYPES;
}

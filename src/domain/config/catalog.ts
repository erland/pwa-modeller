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

export const UML_ELEMENT_TYPES: ElementType[] = [
  'uml.class',
  'uml.interface',
  'uml.enum',
  'uml.package',
  'uml.usecase',
  'uml.actor',
  'uml.note',
];

export const UML_RELATIONSHIP_TYPES: RelationshipType[] = [
  'uml.association',
  'uml.aggregation',
  'uml.composition',
  'uml.generalization',
  'uml.realization',
  'uml.dependency'
];

// -------------------------
// BPMN (Process diagram v1)
// -------------------------

export const BPMN_ELEMENT_TYPES: ElementType[] = [
  // Containers
  'bpmn.pool',
  'bpmn.lane',

  // Activities
  'bpmn.task',
  'bpmn.userTask',
  'bpmn.serviceTask',
  'bpmn.scriptTask',
  'bpmn.manualTask',
  'bpmn.callActivity',
  'bpmn.subProcess',

  // Events
  'bpmn.startEvent',
  'bpmn.endEvent',
  'bpmn.intermediateCatchEvent',
  'bpmn.intermediateThrowEvent',
  'bpmn.boundaryEvent',

  // Gateways
  'bpmn.gatewayExclusive',
  'bpmn.gatewayParallel',
  'bpmn.gatewayInclusive',
  'bpmn.gatewayEventBased',

  // Artifacts
  'bpmn.textAnnotation'
];

export const BPMN_RELATIONSHIP_TYPES: RelationshipType[] = [
  'bpmn.sequenceFlow',
  'bpmn.messageFlow',
  'bpmn.association'
];

export type TypeOption<TId extends string = string> = { id: TId; label: string };

const UML_ELEMENT_TYPE_LABELS: Partial<Record<ElementType, string>> = {
  'uml.class': 'Class',
  'uml.interface': 'Interface',
  'uml.enum': 'Enum',
  'uml.package': 'Package',
  'uml.usecase': 'Use Case',
  'uml.actor': 'Actor',
  'uml.note': 'Note'
};

const BPMN_ELEMENT_TYPE_LABELS: Partial<Record<ElementType, string>> = {
  // Containers
  'bpmn.pool': 'Pool (Participant)',
  'bpmn.lane': 'Lane',

  // Activities
  'bpmn.task': 'Task',
  'bpmn.userTask': 'User Task',
  'bpmn.serviceTask': 'Service Task',
  'bpmn.scriptTask': 'Script Task',
  'bpmn.manualTask': 'Manual Task',
  'bpmn.callActivity': 'Call Activity',
  'bpmn.subProcess': 'Sub-Process',

  // Events
  'bpmn.startEvent': 'Start Event',
  'bpmn.endEvent': 'End Event',
  'bpmn.intermediateCatchEvent': 'Intermediate Catch Event',
  'bpmn.intermediateThrowEvent': 'Intermediate Throw Event',
  'bpmn.boundaryEvent': 'Boundary Event',

  // Gateways
  'bpmn.gatewayExclusive': 'Exclusive Gateway',
  'bpmn.gatewayParallel': 'Parallel Gateway',
  'bpmn.gatewayInclusive': 'Inclusive Gateway',
  'bpmn.gatewayEventBased': 'Event-Based Gateway',

  // Artifacts
  'bpmn.textAnnotation': 'Text Annotation'
};

const UML_RELATIONSHIP_TYPE_LABELS: Partial<Record<RelationshipType, string>> = {
  'uml.association': 'Association',
  'uml.aggregation': 'Aggregation',
  'uml.composition': 'Composition',
  'uml.generalization': 'Generalization',
  'uml.realization': 'Realization',
  'uml.dependency': 'Dependency'
};

const BPMN_RELATIONSHIP_TYPE_LABELS: Partial<Record<RelationshipType, string>> = {
  'bpmn.sequenceFlow': 'Sequence Flow',
  'bpmn.messageFlow': 'Message Flow',
  'bpmn.association': 'Association'
};

export function getElementTypeLabel(typeId: ElementType | string): string {
  // We keep internal ids like "uml.class" but show a friendly label when available.
  // ArchiMate element ids fall back to the id itself.
  const labels = {
    ...UML_ELEMENT_TYPE_LABELS,
    ...BPMN_ELEMENT_TYPE_LABELS
  } as Record<string, string>;
  return labels[typeId] ?? typeId;
}

export function getRelationshipTypeLabel(typeId: RelationshipType | string): string {
  // Same pattern as element labels.
  const labels = {
    ...UML_RELATIONSHIP_TYPE_LABELS,
    ...BPMN_RELATIONSHIP_TYPE_LABELS
  } as Record<string, string>;
  return labels[typeId] ?? typeId;
}

export function getElementTypeOptionsForKind(kind: ModelKind): TypeOption<ElementType>[] {
  return getElementTypesForKind(kind).map((id) => ({ id, label: getElementTypeLabel(id) }));
}

export function getRelationshipTypeOptionsForKind(kind: ModelKind): TypeOption<RelationshipType>[] {
  return getRelationshipTypesForKind(kind).map((id) => ({ id, label: getRelationshipTypeLabel(id) }));
}



export function getElementTypesForKind(kind: ModelKind): ElementType[] {
  if (kind === 'uml') return UML_ELEMENT_TYPES;
  if (kind === 'bpmn') return BPMN_ELEMENT_TYPES;
  return ELEMENT_TYPES;
}

export function getRelationshipTypesForKind(kind: ModelKind): RelationshipType[] {
  if (kind === 'uml') return UML_RELATIONSHIP_TYPES;
  if (kind === 'bpmn') return BPMN_RELATIONSHIP_TYPES;
  return RELATIONSHIP_TYPES;
}

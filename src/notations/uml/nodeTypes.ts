import type {
  UmlClassifierTypeId,
  UmlDeploymentTargetTypeId,
} from '../../domain/uml/typeGroups';
import {
  isUmlClassifierTypeId,
  isUmlDeploymentTargetTypeId,
} from '../../domain/uml/typeGroups';

export const UML_NODE_TYPES = [
  'uml.class',
  'uml.interface',
  'uml.enum',
  'uml.package',
  'uml.datatype',
  'uml.primitiveType',
  'uml.component',
  'uml.artifact',
  'uml.node',
  'uml.device',
  'uml.executionEnvironment',
  'uml.subject',
  'uml.usecase',
  'uml.actor',
  'uml.note',
  'uml.activity',
  'uml.action',
  'uml.initialNode',
  'uml.activityFinalNode',
  'uml.flowFinalNode',
  'uml.decisionNode',
  'uml.mergeNode',
  'uml.forkNode',
  'uml.joinNode',
  'uml.objectNode',
] as const;
export type UmlNodeType = (typeof UML_NODE_TYPES)[number];

export const UML_RELATIONSHIP_TYPES = [
  'uml.association',
  'uml.aggregation',
  'uml.composition',
  'uml.generalization',
  'uml.realization',
  'uml.dependency',
  'uml.include',
  'uml.extend',
  'uml.communicationPath',
  'uml.deployment',
  'uml.controlFlow',
  'uml.objectFlow',
] as const;
export type UmlRelationshipType = (typeof UML_RELATIONSHIP_TYPES)[number];
export const UML_ACTIVITY_NODE_TYPES = [
  'uml.action',
  'uml.initialNode',
  'uml.activityFinalNode',
  'uml.flowFinalNode',
  'uml.decisionNode',
  'uml.mergeNode',
  'uml.forkNode',
  'uml.joinNode',
  'uml.objectNode',
] as const;
export type UmlActivityNodeType = (typeof UML_ACTIVITY_NODE_TYPES)[number];

const UML_ACTIVITY_NODE_TYPES_SET = new Set<string>(UML_ACTIVITY_NODE_TYPES);

export function isUmlActivityNodeType(t: string): t is UmlActivityNodeType {
  return UML_ACTIVITY_NODE_TYPES_SET.has(t);
}


const UML_NODE_TYPES_SET = new Set<string>(UML_NODE_TYPES);
const UML_REL_TYPES_SET = new Set<string>(UML_RELATIONSHIP_TYPES);

export function isUmlNodeType(t: string): t is UmlNodeType {
  return UML_NODE_TYPES_SET.has(t);
}

export function isUmlClassifierType(
  t: string
): t is UmlClassifierTypeId {
  return isUmlClassifierTypeId(t);
}

export function isUmlComponentType(t: string): t is 'uml.component' {
  return t === 'uml.component';
}

export function isUmlArtifactType(t: string): t is 'uml.artifact' {
  return t === 'uml.artifact';
}

export function isUmlDeploymentTargetType(
  t: string
): t is UmlDeploymentTargetTypeId {
  return isUmlDeploymentTargetTypeId(t);
}

export function isUmlUseCaseType(t: string): t is 'uml.usecase' {
  return t === 'uml.usecase';
}

export function isUmlActorType(t: string): t is 'uml.actor' {
  return t === 'uml.actor';
}

export function isUmlPackageType(t: string): t is 'uml.package' {
  return t === 'uml.package';
}

export function isUmlNoteType(t: string): t is 'uml.note' {
  return t === 'uml.note';
}

export function isUmlRelationshipType(t: string): t is UmlRelationshipType {
  return UML_REL_TYPES_SET.has(t);
}

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
] as const;
export type UmlRelationshipType = (typeof UML_RELATIONSHIP_TYPES)[number];

const UML_NODE_TYPES_SET = new Set<string>(UML_NODE_TYPES);
const UML_REL_TYPES_SET = new Set<string>(UML_RELATIONSHIP_TYPES);

export function isUmlNodeType(t: string): t is UmlNodeType {
  return UML_NODE_TYPES_SET.has(t);
}

export function isUmlClassifierType(
  t: string
): t is
  | 'uml.class'
  | 'uml.interface'
  | 'uml.enum'
  | 'uml.datatype'
  | 'uml.primitiveType'
  | 'uml.component'
  | 'uml.node'
  | 'uml.device'
  | 'uml.executionEnvironment' {
  return (
    t === 'uml.class' ||
    t === 'uml.interface' ||
    t === 'uml.enum' ||
    t === 'uml.datatype' ||
    t === 'uml.primitiveType' ||
    t === 'uml.component' ||
    t === 'uml.node' ||
    t === 'uml.device' ||
    t === 'uml.executionEnvironment'
  );
}

export function isUmlComponentType(t: string): t is 'uml.component' {
  return t === 'uml.component';
}

export function isUmlArtifactType(t: string): t is 'uml.artifact' {
  return t === 'uml.artifact';
}

export function isUmlDeploymentTargetType(
  t: string
): t is 'uml.node' | 'uml.device' | 'uml.executionEnvironment' {
  return t === 'uml.node' || t === 'uml.device' || t === 'uml.executionEnvironment';
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

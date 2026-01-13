export const UML_NODE_TYPES = ['uml.class', 'uml.interface', 'uml.enum', 'uml.package', 'uml.note'] as const;
export type UmlNodeType = (typeof UML_NODE_TYPES)[number];

export const UML_RELATIONSHIP_TYPES = [
  'uml.association',
  'uml.aggregation',
  'uml.composition',
  'uml.generalization',
  'uml.realization',
  'uml.dependency',
] as const;
export type UmlRelationshipType = (typeof UML_RELATIONSHIP_TYPES)[number];

const UML_NODE_TYPES_SET = new Set<string>(UML_NODE_TYPES);
const UML_REL_TYPES_SET = new Set<string>(UML_RELATIONSHIP_TYPES);

export function isUmlNodeType(t: string): t is UmlNodeType {
  return UML_NODE_TYPES_SET.has(t);
}

export function isUmlRelationshipType(t: string): t is UmlRelationshipType {
  return UML_REL_TYPES_SET.has(t);
}

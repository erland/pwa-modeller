/**
 * Shared UML type groupings used by both notation rules and domain validation.
 *
 * Keeping these in the domain layer avoids subtle drift (e.g. rules allow a
 * connection but validation/cycle-detection doesn't consider the same types).
 */

export const UML_DEPLOYMENT_TARGET_TYPE_IDS = [
  'uml.node',
  'uml.device',
  'uml.executionEnvironment',
] as const;
export type UmlDeploymentTargetTypeId = (typeof UML_DEPLOYMENT_TARGET_TYPE_IDS)[number];

export const UML_CLASSIFIER_TYPE_IDS = [
  'uml.class',
  'uml.associationClass',
  'uml.interface',
  'uml.enum',
  'uml.datatype',
  'uml.primitiveType',
  'uml.component',
  // UML deployment targets are classifiers in UML and are treated as such by our v1 rules.
  'uml.node',
  'uml.device',
  'uml.executionEnvironment',
] as const;
export type UmlClassifierTypeId = (typeof UML_CLASSIFIER_TYPE_IDS)[number];

export const UML_GENERALIZABLE_TYPE_IDS = [
  ...UML_CLASSIFIER_TYPE_IDS,
  // Allow generalization within actor / use-case hierarchies.
  'uml.actor',
  'uml.usecase',
] as const;
export type UmlGeneralizableTypeId = (typeof UML_GENERALIZABLE_TYPE_IDS)[number];
export const UML_ACTIVITY_CONTAINER_TYPE_IDS = [
  'uml.activity',
] as const;
export type UmlActivityContainerTypeId = (typeof UML_ACTIVITY_CONTAINER_TYPE_IDS)[number];

export const UML_ACTIVITY_NODE_TYPE_IDS = [
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
export type UmlActivityNodeTypeId = (typeof UML_ACTIVITY_NODE_TYPE_IDS)[number];


const DEPLOYMENT_TARGET_SET = new Set<string>(UML_DEPLOYMENT_TARGET_TYPE_IDS);
const CLASSIFIER_SET = new Set<string>(UML_CLASSIFIER_TYPE_IDS);
const GENERALIZABLE_SET = new Set<string>(UML_GENERALIZABLE_TYPE_IDS);

const ACTIVITY_CONTAINER_SET = new Set<string>(UML_ACTIVITY_CONTAINER_TYPE_IDS);
const ACTIVITY_NODE_SET = new Set<string>(UML_ACTIVITY_NODE_TYPE_IDS);

export function isUmlDeploymentTargetTypeId(t: string): t is UmlDeploymentTargetTypeId {
  return DEPLOYMENT_TARGET_SET.has(t);
}

export function isUmlClassifierTypeId(t: string): t is UmlClassifierTypeId {
  return CLASSIFIER_SET.has(t);
}

export function isUmlGeneralizableTypeId(t: string): t is UmlGeneralizableTypeId {
  return GENERALIZABLE_SET.has(t);
}
export function isUmlActivityContainerTypeId(t: string): t is UmlActivityContainerTypeId {
  return ACTIVITY_CONTAINER_SET.has(t);
}

export function isUmlActivityNodeTypeId(t: string): t is UmlActivityNodeTypeId {
  return ACTIVITY_NODE_SET.has(t);
}


export const UML_DEPLOYMENT_TARGET_TYPE_IDS_SET = DEPLOYMENT_TARGET_SET;
export const UML_CLASSIFIER_TYPE_IDS_SET = CLASSIFIER_SET;
export const UML_GENERALIZABLE_TYPE_IDS_SET = GENERALIZABLE_SET;
export const UML_ACTIVITY_CONTAINER_TYPE_IDS_SET = ACTIVITY_CONTAINER_SET;
export const UML_ACTIVITY_NODE_TYPE_IDS_SET = ACTIVITY_NODE_SET;

import type { RelationshipValidationMode } from '../../domain';

import {
  isUmlActorType,
  isUmlActivityNodeType,
  isUmlArtifactType,
  isUmlClassifierType,
  isUmlComponentType,
  isUmlDeploymentTargetType,
  isUmlNodeType,
  isUmlNoteType,
  isUmlPackageType,
  isUmlRelationshipType,
  isUmlUseCaseType,
} from './nodeTypes';

export type UmlGuardResult = { allowed: true } | { allowed: false; reason?: string };

export function canCreateUmlNode(nodeType: string): boolean {
  return isUmlNodeType(nodeType);
}

export function canCreateUmlRelationship(args: {
  relationshipType: string;
  sourceType?: string;
  targetType?: string;
  mode?: RelationshipValidationMode;
}): UmlGuardResult {
  const { relationshipType, sourceType, targetType } = args;

  if (!isUmlRelationshipType(relationshipType)) {
    return { allowed: false, reason: 'Unknown UML relationship type.' };
  }

  // If endpoints aren't known yet (e.g. preflight), allow.
  if (!sourceType || !targetType) return { allowed: true };

  // Minimal v1 rule: only allow UML-to-UML relationships.
  if (!isUmlNodeType(sourceType) || !isUmlNodeType(targetType)) {
    return { allowed: false, reason: 'UML relationships require UML nodes.' };
  }

  // Notes are not connectable.
  if (isUmlNoteType(sourceType) || isUmlNoteType(targetType)) {
    return { allowed: false, reason: 'Notes cannot participate in relationships.' };
  }

  const isClassLike = (t: string) => t === 'uml.class' || t === 'uml.associationClass';

  // Basic UML rules (kept intentionally permissive for v1).
  switch (relationshipType) {

    case 'uml.controlFlow':
    case 'uml.objectFlow':
      // Activity diagrams: flows connect ActivityNodes (actions, control nodes, object nodes).
      if (isUmlActivityNodeType(sourceType) && isUmlActivityNodeType(targetType)) return { allowed: true };
      return { allowed: false, reason: 'Control/Object flow is allowed only between Activity Nodes.' };

    case 'uml.generalization':
      // Allow generalization between classifiers, actors, or use cases.
      if (
        (isUmlClassifierType(sourceType) && isUmlClassifierType(targetType)) ||
        (isUmlActorType(sourceType) && isUmlActorType(targetType)) ||
        (isUmlUseCaseType(sourceType) && isUmlUseCaseType(targetType))
      ) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: 'Generalization is allowed between classifiers (class/interface/enum), between actors, or between use cases.',
      };

    case 'uml.realization':
      // Realization: commonly Class->Interface or Component->Interface.
      if (!(((isClassLike(sourceType)) || isUmlComponentType(sourceType)) && targetType === 'uml.interface')) {
        return { allowed: false, reason: 'Realization is allowed from Class/Component to Interface.' };
      }
      return { allowed: true };

    case 'uml.aggregation':
    case 'uml.composition':
      // Whole/part: keep it between classes/enums.
      if (!isClassLike(sourceType)) {
        return { allowed: false, reason: 'Aggregation/Composition source should be a Class.' };
      }
      if (!(isClassLike(targetType) || targetType === 'uml.enum')) {
        return { allowed: false, reason: 'Aggregation/Composition target should be a Class or Enum.' };
      }
      return { allowed: true };

    case 'uml.include':
    case 'uml.extend':
      // Use case diagram: include/extend between use cases.
      if (isUmlUseCaseType(sourceType) && isUmlUseCaseType(targetType)) return { allowed: true };
      return { allowed: false, reason: 'Include/Extend is allowed only between Use Cases.' };

    case 'uml.deployment':
      // Deployment: Artifact -> Node/Device/ExecutionEnvironment.
      if (!isUmlArtifactType(sourceType)) return { allowed: false, reason: 'Deployment source should be an Artifact.' };
      if (!isUmlDeploymentTargetType(targetType)) {
        return { allowed: false, reason: 'Deployment target should be a Node, Device, or Execution Environment.' };
      }
      return { allowed: true };

    case 'uml.communicationPath':
      // Deployment diagram: communication path between nodes/devices/execution environments.
      if (isUmlDeploymentTargetType(sourceType) && isUmlDeploymentTargetType(targetType)) return { allowed: true };
      return { allowed: false, reason: 'Communication Path is allowed between Nodes/Devices/Execution Environments.' };

    case 'uml.dependency':
      // Allow dependency between packages, and between any non-note UML nodes.
      if (isUmlPackageType(sourceType) || isUmlPackageType(targetType)) {
        return isUmlPackageType(sourceType) && isUmlPackageType(targetType)
          ? { allowed: true }
          : { allowed: false, reason: 'Package dependencies should be between Packages.' };
      }
      return { allowed: true };

    case 'uml.association':
    default:
      // Association:
      // - Class diagram: between classifiers.
      // - Use case diagram: actor<->usecase or usecase<->usecase.
      if (isUmlClassifierType(sourceType) && isUmlClassifierType(targetType)) {
        return { allowed: true };
      }

      if ((isUmlActorType(sourceType) && isUmlUseCaseType(targetType)) || (isUmlUseCaseType(sourceType) && isUmlActorType(targetType))) {
        return { allowed: true };
      }

      if (isUmlUseCaseType(sourceType) && isUmlUseCaseType(targetType)) {
        return { allowed: true };
      }

      return {
        allowed: false,
        reason: 'Association is allowed between classifiers, between use cases, or between an actor and a use case.',
      };
  }
}

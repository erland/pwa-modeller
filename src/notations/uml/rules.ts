import type { RelationshipValidationMode } from '../../domain';

import {
  isUmlActorType,
  isUmlClassifierType,
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

  // Basic class diagram rules (kept intentionally permissive for v1).
  switch (relationshipType) {
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
      // Class realizes an interface (keep v1 strict).
      if (sourceType !== 'uml.class' || targetType !== 'uml.interface') {
        return { allowed: false, reason: 'Realization is allowed from Class to Interface.' };
      }
      return { allowed: true };

    case 'uml.aggregation':
    case 'uml.composition':
      // Whole/part: keep it between classes/enums.
      if (sourceType !== 'uml.class') {
        return { allowed: false, reason: 'Aggregation/Composition source should be a Class.' };
      }
      if (!(targetType === 'uml.class' || targetType === 'uml.enum')) {
        return { allowed: false, reason: 'Aggregation/Composition target should be a Class or Enum.' };
      }
      return { allowed: true };

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

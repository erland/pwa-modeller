import type { RelationshipStyle } from '../../diagram/relationships/style';
import type { Notation } from '../types';
import { isUmlClassifierType, isUmlNodeType, isUmlNoteType, isUmlPackageType, isUmlRelationshipType } from './nodeTypes';
import { renderUmlNodeSymbol } from './renderNodeSymbol';
import { renderUmlNodeContent } from './renderNodeContent';

type UmlRelAttrs = {
  /** Optional navigability for associations (v1: boolean directed). */
  isDirected?: boolean;
};

function normalizeUmlRelAttrs(attrs: unknown): UmlRelAttrs {
  if (!attrs || typeof attrs !== 'object') return {};
  const a = attrs as Record<string, unknown>;
  return { isDirected: typeof a.isDirected === 'boolean' ? a.isDirected : undefined };
}

function umlRelationshipStyle(type: string): RelationshipStyle {
  // Step 3: class-diagram relationship styles using the shared marker registry.
  switch (type) {
    case 'uml.generalization':
      return { markerEnd: 'triangleOpen' };
    case 'uml.realization':
      return { markerEnd: 'triangleOpen', line: { pattern: 'dashed' } };
    case 'uml.dependency':
      return { markerEnd: 'arrowOpen', line: { pattern: 'dashed' } };
    case 'uml.aggregation':
      return { markerStart: 'diamondOpen' };
    case 'uml.composition':
      return { markerStart: 'diamondFilled' };
    case 'uml.association':
    default:
      // Default association is an undirected solid line.
      return {};
  }
}

/**
 * UML notation implementation.
 *
 * Step 2: provides compartment-style node rendering for UML class diagrams.
 */
export const umlNotation: Notation = {
  kind: 'uml',

  // Neutral background: reuse an existing layer var to avoid requiring new CSS in Step 2.
  getElementBgVar: () => 'var(--arch-layer-application)',

  renderNodeSymbol: ({ nodeType }) => renderUmlNodeSymbol(nodeType),

  // Replace the default ArchiMate-oriented node header/meta layout with UML compartments.
  renderNodeContent: (args) => renderUmlNodeContent(args),

  getRelationshipStyle: (rel: { type: string; attrs?: unknown }): RelationshipStyle => {
    if (!isUmlRelationshipType(rel.type)) {
      // Unknown in UML view: keep it visible but neutral.
      return { markerEnd: 'arrowOpen' };
    }

    if (rel.type === 'uml.association') {
      const a = normalizeUmlRelAttrs(rel.attrs);
      // Optional directed association (navigability v1).
      return a.isDirected ? { markerEnd: 'arrowOpen' } : {};
    }

    return umlRelationshipStyle(rel.type);
  },

  canCreateNode: ({ nodeType }) => {
    // Prevent dropping ArchiMate elements into UML views.
    return isUmlNodeType(nodeType);
  },

  canCreateRelationship: ({ relationshipType, sourceType, targetType }) => {
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
        if (!isUmlClassifierType(sourceType) || !isUmlClassifierType(targetType)) {
          return { allowed: false, reason: 'Generalization is allowed between classifiers (class/interface/enum).' };
        }
        return { allowed: true };

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
        // Association: classifiers only (avoid packages for now).
        if (!isUmlClassifierType(sourceType) || !isUmlClassifierType(targetType)) {
          return { allowed: false, reason: 'Association is allowed between classifiers (class/interface/enum).' };
        }
        return { allowed: true };
    }
  },
};

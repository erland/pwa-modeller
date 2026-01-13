import type { RelationshipStyle } from '../../diagram/relationships/style';
import type { Notation } from '../types';
import { isUmlNodeType, isUmlRelationshipType } from './nodeTypes';
import { renderUmlNodeSymbol } from './renderNodeSymbol';
import { renderUmlNodeContent } from './renderNodeContent';

function umlRelationshipStyle(type: string): RelationshipStyle {
  // Step 3 refines these styles further; v1 focuses on node rendering.
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
      return { markerEnd: 'none' };
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

    return { allowed: true };
  },
};

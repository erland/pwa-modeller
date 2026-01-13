import * as React from 'react';
import type { RelationshipStyle } from '../../diagram/relationships/style';
import type { Notation } from '../types';

/**
 * Minimal UML notation implementation (Step 1).
 *
 * Rendering is intentionally simple; Step 2 adds proper compartment rendering.
 */

export const UML_NODE_TYPES = [
  'uml.class',
  'uml.interface',
  'uml.enum',
  'uml.package',
  'uml.note',
] as const;

export const UML_RELATIONSHIP_TYPES = [
  'uml.association',
  'uml.aggregation',
  'uml.composition',
  'uml.generalization',
  'uml.realization',
  'uml.dependency',
] as const;

const UML_NODE_TYPES_SET = new Set<string>(UML_NODE_TYPES);
const UML_REL_TYPES_SET = new Set<string>(UML_RELATIONSHIP_TYPES);

function isUmlNodeType(t: string): boolean {
  return UML_NODE_TYPES_SET.has(t);
}

function isUmlRelationshipType(t: string): boolean {
  return UML_REL_TYPES_SET.has(t);
}

function shortLabel(nodeType: string): string {
  switch (nodeType) {
    case 'uml.class':
      return 'C';
    case 'uml.interface':
      return 'I';
    case 'uml.enum':
      return 'E';
    case 'uml.package':
      return 'P';
    case 'uml.note':
      return 'N';
    default:
      return 'UML';
  }
}

function umlRelationshipStyle(type: string): RelationshipStyle {
  // Keep styles simple for Step 1; Step 3 refines markers and rules further.
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

export const umlNotation: Notation = {
  kind: 'uml',

  // Neutral background: reuse an existing layer var to avoid requiring new CSS in Step 1.
  getElementBgVar: () => 'var(--arch-layer-application)',

  // DiagramNode uses this as a small symbol/icon next to the title.
  renderNodeSymbol: ({ nodeType }) => {
    const label = shortLabel(nodeType);
    return React.createElement(
      'div',
      {
        style: {
          width: 22,
          height: 22,
          border: '1px solid currentColor',
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          lineHeight: 1,
          userSelect: 'none',
        },
        title: nodeType,
      },
      label
    );
  },

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

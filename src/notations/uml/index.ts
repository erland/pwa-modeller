import * as React from 'react';

import type { RelationshipStyle } from '../../diagram/relationships/style';
import { getElementTypeOptionsForKind, getRelationshipTypeOptionsForKind } from '../../domain';
import { validateUmlBasics } from '../../domain/validation/uml';

import type { Notation } from '../types';
import { isUmlRelationshipType } from './nodeTypes';
import { canCreateUmlNode, canCreateUmlRelationship } from './rules';
import { renderUmlNodeSymbol } from './renderNodeSymbol';
import { renderUmlNodeContent } from './renderNodeContent';

import { UmlRelationshipProperties } from '../../components/model/properties/uml/UmlRelationshipProperties';
import { UmlClassifierMembersSection } from '../../components/model/properties/uml/UmlClassifierMembersSection';

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

  // ------------------------------
  // Rendering + interaction
  // ------------------------------

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
    return canCreateUmlNode(nodeType);
  },

  canCreateRelationship: (args) => {
    return canCreateUmlRelationship(args);
  },

  // ------------------------------
  // Notation plugin contract v1
  // ------------------------------

  getElementTypeOptions: () => getElementTypeOptionsForKind('uml'),

  getRelationshipTypeOptions: () => getRelationshipTypeOptionsForKind('uml'),

  getElementPropertySections: ({ element, actions }) => {
    // Class/Interface members are semantic and stored on the element.
    // (View-local toggles for showing/hiding compartments live on the node.)
    if (element.type !== 'uml.class' && element.type !== 'uml.interface') return [];
    return [
      {
        key: 'uml.classifier.members',
        content: React.createElement(UmlClassifierMembersSection, { element, actions }),
      },
    ];
  },

  renderRelationshipProperties: ({ model, relationshipId, viewId, actions, onSelect }) => {
    return React.createElement(UmlRelationshipProperties, { model, relationshipId, viewId, actions, onSelect });
  },

  validateNotation: ({ model }) => {
    return validateUmlBasics(model);
  },
};

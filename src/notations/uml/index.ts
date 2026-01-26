import * as React from 'react';

import type { RelationshipStyle } from '../../diagram/relationships/style';
import { getElementTypeOptionsForKind, getRelationshipTypeOptionsForKind } from '../../domain';
import { kindsPresent } from '../../domain/validation/kindsPresent';
import { validateUmlBasics } from '../../domain/validation/uml';

import type { Notation } from '../types';
import { isUmlRelationshipType } from './nodeTypes';
import { canCreateUmlNode, canCreateUmlRelationship } from './rules';
import { renderUmlNodeSymbol } from './renderNodeSymbol';
import { renderUmlNodeContent } from './renderNodeContent';

import { UmlRelationshipProperties } from '../../components/model/properties/uml/UmlRelationshipProperties';
import { UmlClassifierMembersSection } from '../../components/model/properties/uml/UmlClassifierMembersSection';
import { UmlStereotypeSection } from '../../components/model/properties/uml/UmlStereotypeSection';
import { UmlActivitySection } from '../../components/model/properties/uml/UmlActivitySection';

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
    case 'uml.include':
      // Use Case: <<include>> is usually rendered as a dashed dependency.
      return { markerEnd: 'arrowOpen', line: { pattern: 'dashed' }, midLabel: '«include»' };
    case 'uml.extend':
      // Use Case: <<extend>> is usually rendered as a dashed dependency.
      return { markerEnd: 'arrowOpen', line: { pattern: 'dashed' }, midLabel: '«extend»' };
    case 'uml.controlFlow':
      return { markerEnd: 'arrowOpen' };
    case 'uml.objectFlow':
      return { markerEnd: 'arrowOpen' };
    case 'uml.deployment':
      // Deployment: dashed dependency-like arrow with stereotype label.
      return { markerEnd: 'arrowOpen', line: { pattern: 'dashed' }, midLabel: '«deployment»' };
    case 'uml.aggregation':
      return { markerStart: 'diamondOpen' };
    case 'uml.composition':
      return { markerStart: 'diamondFilled' };
    case 'uml.communicationPath':
      // Deployment diagram: communication path is typically an undirected solid line.
      return {};
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

  getElementPropertySections: ({ model, element, actions, onSelect }) => {
    if (typeof element.type !== "string" || !element.type.startsWith("uml.")) return [];

    type Section = { key: string; content: React.ReactNode };

    // NOTE: We intentionally widen `content` to ReactNode; different sections have
    // different prop types (some need `model`, some don't), and React's
    // `FunctionComponentElement<P>` is invariant in `P`.
    const sections: Section[] = [
      {
        key: "uml.stereotype",
        content: React.createElement(UmlStereotypeSection, { element, actions }),
      },
    ];

    // Class/Interface members are semantic and stored on the element.
    // (View-local toggles for showing/hiding compartments live on the node.)
    if (element.type === "uml.class" || element.type === "uml.interface") {
      sections.push({
        key: "uml.classifier.members",
        content: React.createElement(UmlClassifierMembersSection, { element, actions }),
      });
    }

    // UML Activity (element-level) metadata: action kind, containment.
    sections.push({
      key: "uml.activity",
      content: React.createElement(UmlActivitySection, { model, element, actions, onSelect }),
    });

    return sections;
  },


  renderRelationshipProperties: ({ model, relationshipId, viewId, actions, onSelect }) => {
    return React.createElement(UmlRelationshipProperties, { model, relationshipId, viewId, actions, onSelect });
  },

  validateNotation: ({ model }) => {
    // Self-contained: only validate when UML content is present.
    if (!kindsPresent(model).has('uml')) return [];
    return validateUmlBasics(model);
  },
};

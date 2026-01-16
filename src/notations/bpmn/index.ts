import * as React from 'react';

import type { RelationshipStyle } from '../../diagram/relationships/style';
import { getElementTypeOptionsForKind, getRelationshipTypeOptionsForKind } from '../../domain';

import type { Notation } from '../types';

/**
 * BPMN notation implementation (Process diagram v1).
 *
 * Step 1 scope: make BPMN a first-class kind for catalogs + viewpoint + creation flows.
 * Rendering and proper BPMN symbols come in Step 2.
 */
export const bpmnNotation: Notation = {
  kind: 'bpmn',

  // ------------------------------
  // Rendering + interaction (minimal v1)
  // ------------------------------

  // Reuse an existing background var until BPMN-specific styling is introduced.
  getElementBgVar: () => 'var(--arch-layer-business)',

  // Step 2 will replace this with real BPMN symbols.
  renderNodeSymbol: ({ nodeType }) => {
    const s = String(nodeType);
    const label = s.startsWith('bpmn.') ? 'B' : '?';
    return React.createElement(
      'span',
      {
        style: {
          fontSize: 10,
          fontWeight: 700,
          lineHeight: '12px',
          padding: '0 4px',
          borderRadius: 6,
          border: '1px solid rgba(0,0,0,0.25)'
        }
      },
      label
    );
  },

  getRelationshipStyle: (_rel: { type: string; attrs?: unknown }): RelationshipStyle => {
    // Step 3 will introduce proper BPMN sequence flow styling.
    return { markerEnd: 'arrowOpen' };
  },

  canCreateNode: ({ nodeType }) => {
    // Prevent dropping ArchiMate/UML elements into BPMN views.
    return String(nodeType).startsWith('bpmn.');
  },

  canCreateRelationship: ({ relationshipType }) => {
    // Step 3 will introduce stricter BPMN rules.
    return String(relationshipType).startsWith('bpmn.') ? { allowed: true } : { allowed: false };
  },

  // ------------------------------
  // Notation plugin contract v1
  // ------------------------------

  getElementTypeOptions: () => getElementTypeOptionsForKind('bpmn'),

  getRelationshipTypeOptions: () => getRelationshipTypeOptionsForKind('bpmn'),

  getElementPropertySections: () => {
    // v1: BPMN element properties are handled by the common panel.
    return [];
  },

  renderRelationshipProperties: () => {
    // Step 4 will add a BPMN-specific relationship properties component.
    return React.createElement('div', { className: 'panelHint' }, 'BPMN properties not implemented yet.');
  },

  validateNotation: () => {
    // Step 4 will add basic BPMN validation.
    return [];
  }
};

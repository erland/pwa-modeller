import * as React from 'react';

import type { RelationshipStyle } from '../../diagram/relationships/style';
import { getElementTypeOptionsForKind, getRelationshipTypeOptionsForKind } from '../../domain';
import { validateBpmnBasics } from '../../domain/validation/bpmn';

import { renderBpmnNodeContent } from './renderNodeContent';
import { renderBpmnNodeSymbol } from './renderNodeSymbol';

import type { Notation } from '../types';

import { BpmnRelationshipProperties } from '../../components/model/properties/bpmn/BpmnRelationshipProperties';

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

  // BPMN diagrams typically use neutral whites; keep the canvas readable and consistent.
  getElementBgVar: () => 'rgba(255, 255, 255, 0.92)',

  renderNodeSymbol: ({ nodeType }) => renderBpmnNodeSymbol(String(nodeType)),

  // BPMN has strong shape semantics, so we override the full node content.
  renderNodeContent: ({ element, node }) => renderBpmnNodeContent({ element, node }),

  getRelationshipStyle: (rel: { type: string; attrs?: unknown }): RelationshipStyle => {
    // BPMN v1: only Sequence Flow.
    if (rel.type === 'bpmn.sequenceFlow') {
      return {
        markerEnd: 'arrowFilled',
        line: { pattern: 'solid' },
      };
    }

    // Fallback (should rarely be hit because canCreateRelationship blocks others).
    return { markerEnd: 'arrowFilled', line: { pattern: 'solid' } };
  },

  canCreateNode: ({ nodeType }) => {
    // Prevent dropping ArchiMate/UML elements into BPMN views.
    return String(nodeType).startsWith('bpmn.');
  },

  canCreateRelationship: ({ relationshipType, sourceType, targetType }) => {
    const relType = String(relationshipType);
    if (relType !== 'bpmn.sequenceFlow') {
      return { allowed: false, reason: 'Only Sequence Flow is supported in BPMN v1.' };
    }

    // If semantic types are provided, enforce that both ends are BPMN elements.
    if (sourceType && !String(sourceType).startsWith('bpmn.')) {
      return { allowed: false, reason: 'Sequence Flow must start from a BPMN element.' };
    }
    if (targetType && !String(targetType).startsWith('bpmn.')) {
      return { allowed: false, reason: 'Sequence Flow must end at a BPMN element.' };
    }

    return { allowed: true };
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

  renderRelationshipProperties: ({ model, relationshipId, viewId, actions, onSelect }) => {
    return React.createElement(BpmnRelationshipProperties, { model, relationshipId, viewId, actions, onSelect });
  },

  validateNotation: ({ model }) => {
    return validateBpmnBasics(model);
  },
};

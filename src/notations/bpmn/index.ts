import * as React from 'react';

import type { RelationshipStyle } from '../../diagram/relationships/style';
import { getElementTypeOptionsForKind, getRelationshipTypeOptionsForKind } from '../../domain';
import { validateBpmnBasics } from '../../domain/validation/bpmn';

import { renderBpmnNodeContent } from './renderNodeContent';
import { renderBpmnNodeSymbol } from './renderNodeSymbol';

import type { Notation } from '../types';

import { BpmnRelationshipProperties } from '../../components/model/properties/bpmn/BpmnRelationshipProperties';




/**
 * BPMN notation implementation.
 */
function isBpmnFlowNodeType(t: string): boolean {
  return t === 'bpmn.task' || t === 'bpmn.startEvent' || t === 'bpmn.endEvent' || t === 'bpmn.gatewayExclusive';
}

function isBpmnContainerType(t: string): boolean {
  return t === 'bpmn.pool' || t === 'bpmn.lane';
}

export const bpmnNotation: Notation = {
  kind: 'bpmn',

  // ------------------------------
  // Rendering + interaction
  // ------------------------------

  // BPMN diagrams typically use neutral whites; keep the canvas readable and consistent.
  getElementBgVar: () => 'rgba(255, 255, 255, 0.92)',

  renderNodeSymbol: ({ nodeType }) => renderBpmnNodeSymbol(String(nodeType)),

  // BPMN has strong shape semantics, so we override the full node content.
  renderNodeContent: ({ element, node }) => renderBpmnNodeContent({ element, node }),

  getRelationshipStyle: (rel: { type: string; attrs?: unknown }): RelationshipStyle => {
    if (rel.type === 'bpmn.sequenceFlow') {
      return {
        markerEnd: 'arrowFilled',
        line: { pattern: 'solid' },
      };
    }

    if (rel.type === 'bpmn.messageFlow') {
      return {
        markerEnd: 'arrowOpen',
        line: { pattern: 'dashed' },
      };
    }

    // Fallback: keep it readable.
    return { markerEnd: 'arrowFilled', line: { pattern: 'solid' } };
  },

  canCreateNode: ({ nodeType }) => {
    // Prevent dropping ArchiMate/UML elements into BPMN views.
    return String(nodeType).startsWith('bpmn.');
  },

  canCreateRelationship: ({ relationshipType, sourceType, targetType }) => {
    // v2: Disallow connecting to containers (pools/lanes). Relationships are between flow nodes.
    if (sourceType && isBpmnContainerType(sourceType)) return { allowed: false, reason: 'Cannot connect from Pool/Lane' };
    if (targetType && isBpmnContainerType(targetType)) return { allowed: false, reason: 'Cannot connect to Pool/Lane' };

    if (relationshipType === 'bpmn.sequenceFlow') {
      if (sourceType && !isBpmnFlowNodeType(sourceType)) return { allowed: false, reason: 'Sequence Flow must start from a BPMN flow node' };
      if (targetType && !isBpmnFlowNodeType(targetType)) return { allowed: false, reason: 'Sequence Flow must end at a BPMN flow node' };
      return { allowed: true };
    }

    if (relationshipType === 'bpmn.messageFlow') {
      if (sourceType && !isBpmnFlowNodeType(sourceType)) return { allowed: false, reason: 'Message Flow must start from a BPMN flow node' };
      if (targetType && !isBpmnFlowNodeType(targetType)) return { allowed: false, reason: 'Message Flow must end at a BPMN flow node' };
      return { allowed: true };
    }

    return { allowed: false, reason: 'Only Sequence Flow and Message Flow are supported in BPMN v2' };
  },

  // ------------------------------
  // Notation plugin contract
  // ------------------------------

  getElementTypeOptions: () => getElementTypeOptionsForKind('bpmn'),

  getRelationshipTypeOptions: () => getRelationshipTypeOptionsForKind('bpmn'),

  getElementPropertySections: () => {
    // v2: BPMN element properties still use the common panel.
    return [];
  },

  renderRelationshipProperties: ({ model, relationshipId, viewId, actions, onSelect }) => {
    return React.createElement(BpmnRelationshipProperties, { model, relationshipId, viewId, actions, onSelect });
  },

  validateNotation: ({ model }) => {
    return validateBpmnBasics(model);
  },
};

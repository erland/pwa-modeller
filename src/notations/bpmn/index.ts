import * as React from 'react';

import type { RelationshipStyle } from '../../diagram/relationships/style';
import { getElementTypeOptionsForKind, getRelationshipTypeOptionsForKind } from '../../domain';
import { validateBpmnBasics } from '../../domain/validation/bpmn';

import { renderBpmnNodeContent } from './renderNodeContent';
import { renderBpmnNodeSymbol } from './renderNodeSymbol';

import type { Notation } from '../types';

import { BpmnRelationshipProperties } from '../../components/model/properties/bpmn/BpmnRelationshipProperties';

function isBpmnType(t: unknown): boolean {
  return String(t).startsWith('bpmn.');
}

function isLaneOrPool(t: unknown): boolean {
  const s = String(t);
  return s === 'bpmn.pool' || s === 'bpmn.lane';
}

function isFlowNode(t: unknown): boolean {
  const s = String(t);
  return s === 'bpmn.task' || s === 'bpmn.startEvent' || s === 'bpmn.endEvent' || s === 'bpmn.gatewayExclusive';
}

/**
 * BPMN notation implementation.
 */
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
    const relType = String(relationshipType);

    // Only BPMN relationships in BPMN views.
    if (!relType.startsWith('bpmn.')) return { allowed: false, reason: 'Only BPMN relationships are allowed in BPMN views.' };

    // If semantic types are provided, enforce that both ends are BPMN elements.
    if (sourceType && !isBpmnType(sourceType)) {
      return { allowed: false, reason: 'Relationship must start from a BPMN element.' };
    }
    if (targetType && !isBpmnType(targetType)) {
      return { allowed: false, reason: 'Relationship must end at a BPMN element.' };
    }

    if (relType === 'bpmn.sequenceFlow') {
      // Sequence flows connect flow nodes only (not pools/lanes).
      if (sourceType && !isFlowNode(sourceType)) return { allowed: false, reason: 'Sequence Flow must start from a BPMN flow node.' };
      if (targetType && !isFlowNode(targetType)) return { allowed: false, reason: 'Sequence Flow must end at a BPMN flow node.' };
      return { allowed: true };
    }

    if (relType === 'bpmn.messageFlow') {
      // Message flows: allow between participants or flow nodes, but not lanes.
      if (sourceType && String(sourceType) === 'bpmn.lane') return { allowed: false, reason: 'Message Flow cannot start from a Lane.' };
      if (targetType && String(targetType) === 'bpmn.lane') return { allowed: false, reason: 'Message Flow cannot end at a Lane.' };

      // Pools can connect to pools or to nodes in other pools (cross-pool is validated later).
      if (sourceType && isLaneOrPool(sourceType) && String(sourceType) === 'bpmn.pool') return { allowed: true };
      if (targetType && isLaneOrPool(targetType) && String(targetType) === 'bpmn.pool') return { allowed: true };

      // Otherwise, allow between flow nodes (semantic cross-pool rules validated later).
      if (sourceType && !isFlowNode(sourceType)) return { allowed: false, reason: 'Message Flow must start from a BPMN flow node or Pool.' };
      if (targetType && !isFlowNode(targetType)) return { allowed: false, reason: 'Message Flow must end at a BPMN flow node or Pool.' };
      return { allowed: true };
    }

    return { allowed: false, reason: 'Unsupported BPMN relationship type.' };
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

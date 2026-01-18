import * as React from 'react';

import type { RelationshipStyle } from '../../diagram/relationships/style';
import { getElementTypeOptionsForKind, getRelationshipTypeOptionsForKind } from '../../domain';
import { kindsPresent } from '../../domain/validation/kindsPresent';
import { validateBpmnBasics } from '../../domain/validation/bpmn';

import { renderBpmnNodeContent } from './renderNodeContent';
import { renderBpmnNodeSymbol } from './renderNodeSymbol';

import type { Notation } from '../types';

import { BpmnRelationshipProperties } from '../../components/model/properties/bpmn/BpmnRelationshipProperties';
import { BpmnTaskPropertiesSection } from '../../components/model/properties/bpmn/BpmnTaskPropertiesSection';
import { BpmnEventPropertiesSection } from '../../components/model/properties/bpmn/BpmnEventPropertiesSection';
import { BpmnGatewayPropertiesSection } from '../../components/model/properties/bpmn/BpmnGatewayPropertiesSection';




/**
 * BPMN notation implementation.
 */
function isBpmnContainerType(t: string): boolean {
  return t === 'bpmn.pool' || t === 'bpmn.lane';
}

function isBpmnTextAnnotationType(t: string): boolean {
  return t === 'bpmn.textAnnotation';
}

/**
 * "Connectable" BPMN node types are those that can act as endpoints for flows.
 *
 * We intentionally exclude containers (pool/lane) and annotations.
 * Later steps can refine rules using model context (participants, containment).
 */
function isBpmnConnectableNodeType(t: string): boolean {
  if (!t.startsWith('bpmn.')) return false;
  if (isBpmnContainerType(t)) return false;
  if (isBpmnTextAnnotationType(t)) return false;
  return true;
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

    if (rel.type === 'bpmn.association') {
      return {
        markerEnd: 'none',
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
    // Disallow connecting to containers (pools/lanes). Relationships are between flow nodes/artifacts.
    if (sourceType && isBpmnContainerType(sourceType)) return { allowed: false, reason: 'Cannot connect from Pool/Lane' };
    if (targetType && isBpmnContainerType(targetType)) return { allowed: false, reason: 'Cannot connect to Pool/Lane' };

    if (relationshipType === 'bpmn.sequenceFlow') {
      if (sourceType && !isBpmnConnectableNodeType(sourceType))
        return { allowed: false, reason: 'Sequence Flow must start from a BPMN connectable node' };
      if (targetType && !isBpmnConnectableNodeType(targetType))
        return { allowed: false, reason: 'Sequence Flow must end at a BPMN connectable node' };
      return { allowed: true };
    }

    if (relationshipType === 'bpmn.messageFlow') {
      if (sourceType && !isBpmnConnectableNodeType(sourceType))
        return { allowed: false, reason: 'Message Flow must start from a BPMN connectable node' };
      if (targetType && !isBpmnConnectableNodeType(targetType))
        return { allowed: false, reason: 'Message Flow must end at a BPMN connectable node' };
      return { allowed: true };
    }

    if (relationshipType === 'bpmn.association') {
      // Allow a Text Annotation to associate with any connectable BPMN node.
      // (Annotation-to-annotation and connectable-to-connectable are not allowed.)
      const s = sourceType ?? '';
      const t = targetType ?? '';
      const sIsAnn = s ? isBpmnTextAnnotationType(s) : false;
      const tIsAnn = t ? isBpmnTextAnnotationType(t) : false;

      if (s && t && sIsAnn && tIsAnn) return { allowed: false, reason: 'Association should connect a Text Annotation to another element' };

      // If both sides are known, enforce the "one side is annotation" rule.
      if (s && t) {
        if (!(sIsAnn || tIsAnn)) return { allowed: false, reason: 'Association should connect to a Text Annotation' };

        const other = sIsAnn ? t : s;
        if (!isBpmnConnectableNodeType(other))
          return { allowed: false, reason: 'Association should connect to a BPMN node (not pool/lane/annotation)' };
      }

      // If a side is unknown (e.g. connector endpoint), stay permissive.
      return { allowed: true };
    }

    return { allowed: false, reason: 'Only Sequence Flow, Message Flow and Association are supported in BPMN v2' };
  },

  // ------------------------------
  // Notation plugin contract
  // ------------------------------

  getElementTypeOptions: () => getElementTypeOptionsForKind('bpmn'),

  getRelationshipTypeOptions: () => getRelationshipTypeOptionsForKind('bpmn'),

  getElementPropertySections: ({ model, element, actions }) => {
    if (typeof element.type !== 'string' || !element.type.startsWith('bpmn.')) return [];

    const t = String(element.type);
    const sections: { key: string; content: React.ReactNode }[] = [];

    const isActivity =
      t === 'bpmn.task' ||
      t === 'bpmn.userTask' ||
      t === 'bpmn.serviceTask' ||
      t === 'bpmn.scriptTask' ||
      t === 'bpmn.manualTask' ||
      t === 'bpmn.callActivity' ||
      t === 'bpmn.subProcess';

    const isEvent =
      t === 'bpmn.startEvent' ||
      t === 'bpmn.endEvent' ||
      t === 'bpmn.intermediateCatchEvent' ||
      t === 'bpmn.intermediateThrowEvent' ||
      t === 'bpmn.boundaryEvent';

    const isGateway =
      t === 'bpmn.gatewayExclusive' ||
      t === 'bpmn.gatewayParallel' ||
      t === 'bpmn.gatewayInclusive' ||
      t === 'bpmn.gatewayEventBased';

    if (isActivity) sections.push({ key: 'bpmn.activity', content: React.createElement(BpmnTaskPropertiesSection, { model, element, actions }) });
    if (isEvent) sections.push({ key: 'bpmn.event', content: React.createElement(BpmnEventPropertiesSection, { model, element, actions }) });
    if (isGateway) sections.push({ key: 'bpmn.gateway', content: React.createElement(BpmnGatewayPropertiesSection, { model, element, actions }) });

    return sections;
  },

  renderRelationshipProperties: ({ model, relationshipId, viewId, actions, onSelect }) => {
    return React.createElement(BpmnRelationshipProperties, { model, relationshipId, viewId, actions, onSelect });
  },

  validateNotation: ({ model }) => {
    // Self-contained: only validate when BPMN content is present.
    if (!kindsPresent(model).has('bpmn')) return [];
    return validateBpmnBasics(model);
  },
};

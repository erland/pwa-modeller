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
import { BpmnPoolPropertiesSection } from '../../components/model/properties/bpmn/BpmnPoolPropertiesSection';
import { BpmnLanePropertiesSection } from '../../components/model/properties/bpmn/BpmnLanePropertiesSection';
import { BpmnTextAnnotationPropertiesSection } from '../../components/model/properties/bpmn/BpmnTextAnnotationPropertiesSection';
import { BpmnDataObjectReferencePropertiesSection } from '../../components/model/properties/bpmn/BpmnDataObjectReferencePropertiesSection';
import { BpmnDataStoreReferencePropertiesSection } from '../../components/model/properties/bpmn/BpmnDataStoreReferencePropertiesSection';
import { BpmnProcessPropertiesSection } from '../../components/model/properties/bpmn/BpmnProcessPropertiesSection';




/**
 * BPMN notation implementation.
 */
function isBpmnContainerType(t: string): boolean {
  return t === 'bpmn.pool' || t === 'bpmn.lane';
}

function isBpmnArtifactType(t: string): boolean {
  return (
    t === 'bpmn.textAnnotation' ||
    t === 'bpmn.dataObjectReference' ||
    t === 'bpmn.dataStoreReference' ||
    t === 'bpmn.group'
  );
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
  if (isBpmnArtifactType(t)) return false;
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
        markerStart: 'circleOpen',
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

    if (rel.type === 'bpmn.dataInputAssociation' || rel.type === 'bpmn.dataOutputAssociation') {
      // BPMN data associations are dashed with an open arrow head.
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
      const sIsArtifact = s ? isBpmnArtifactType(s) : false;
      const tIsArtifact = t ? isBpmnArtifactType(t) : false;

      if (s && t && sIsArtifact && tIsArtifact) return { allowed: false, reason: 'Association should connect an Artifact to another element' };

      // If both sides are known, enforce the "one side is annotation" rule.
      if (s && t) {
        if (!(sIsArtifact || tIsArtifact)) return { allowed: false, reason: 'Association should connect to a BPMN artifact (annotation/data/group)' };

        const other = sIsArtifact ? t : s;
        if (!isBpmnConnectableNodeType(other))
          return { allowed: false, reason: 'Association should connect to a BPMN element (not pool/lane)' };
      }

      // If a side is unknown (e.g. connector endpoint), stay permissive.
      return { allowed: true };
    }

    if (relationshipType === 'bpmn.dataInputAssociation') {
      // Pragmatic rule: data object/store -> flow node
      const sourceIsData = sourceType === 'bpmn.dataObjectReference' || sourceType === 'bpmn.dataStoreReference';
      if (!sourceIsData) return { allowed: false, reason: 'Data Input Association must start from Data Object/Store' };
      if (targetType && !isBpmnConnectableNodeType(targetType)) return { allowed: false, reason: 'Data Input Association must target a BPMN flow node' };
      return { allowed: true };
    }

    if (relationshipType === 'bpmn.dataOutputAssociation') {
      // Pragmatic rule: flow node -> data object/store
      const targetIsData = targetType === 'bpmn.dataObjectReference' || targetType === 'bpmn.dataStoreReference';
      if (!targetIsData) return { allowed: false, reason: 'Data Output Association must target Data Object/Store' };
      if (sourceType && !isBpmnConnectableNodeType(sourceType)) return { allowed: false, reason: 'Data Output Association must start from a BPMN flow node' };
      return { allowed: true };
    }

    return { allowed: false, reason: 'Only Sequence Flow, Message Flow, Association and Data Associations are supported in BPMN v2' };
  },

  // ------------------------------
  // Notation plugin contract
  // ------------------------------

  getElementTypeOptions: () => getElementTypeOptionsForKind('bpmn'),

  getRelationshipTypeOptions: () => getRelationshipTypeOptionsForKind('bpmn'),

  getElementPropertySections: ({ model, element, actions, onSelect }) => {
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

    const isPool = t === 'bpmn.pool';
    const isLane = t === 'bpmn.lane';
    const isTextAnnotation = t === 'bpmn.textAnnotation';
    const isDataObjectReference = t === 'bpmn.dataObjectReference';
    const isDataStoreReference = t === 'bpmn.dataStoreReference';
    const isProcess = t === 'bpmn.process';

    if (isActivity)
      sections.push({ key: 'bpmn.activity', content: React.createElement(BpmnTaskPropertiesSection, { model, element, actions, onSelect }) });
    if (isEvent) sections.push({ key: 'bpmn.event', content: React.createElement(BpmnEventPropertiesSection, { model, element, actions, onSelect }) });
    if (isGateway)
      sections.push({ key: 'bpmn.gateway', content: React.createElement(BpmnGatewayPropertiesSection, { model, element, actions, onSelect }) });

    if (isPool) sections.push({ key: 'bpmn.pool', content: React.createElement(BpmnPoolPropertiesSection, { model, element, actions, onSelect }) });
    if (isLane) sections.push({ key: 'bpmn.lane', content: React.createElement(BpmnLanePropertiesSection, { model, element, actions, onSelect }) });
    if (isTextAnnotation)
      sections.push({ key: 'bpmn.textAnnotation', content: React.createElement(BpmnTextAnnotationPropertiesSection, { model, element, actions, onSelect }) });
    if (isDataObjectReference)
      sections.push({ key: 'bpmn.dataObjectReference', content: React.createElement(BpmnDataObjectReferencePropertiesSection, { model, element, actions, onSelect }) });
    if (isDataStoreReference)
      sections.push({ key: 'bpmn.dataStoreReference', content: React.createElement(BpmnDataStoreReferencePropertiesSection, { model, element, actions, onSelect }) });
    if (isProcess) sections.push({ key: 'bpmn.process', content: React.createElement(BpmnProcessPropertiesSection, { model, element, actions }) });

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

import type { ElementType, Model, RelationshipType } from '../../../types';
import { kindFromTypeId } from '../../../kindFromTypeId';
import { validateBpmnRelationshipByMatrix } from '../../../config/bpmnPalette';
import { makeIssue } from '../../issues';
import type { ValidationIssue } from '../../types';
import {
  firstBpmnViewWithBothEndpoints,
  isBpmnFlowNodeType,
  poolOfElementInView,
  rectForNode,
  type Rect,
} from '../shared';

/**
 * Relationship endpoint checks + pool rules (best-effort).
 */
export function ruleRelationships(model: Model): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const rel of Object.values(model.relationships)) {
    if (!isSupportedBpmnRelationshipType(rel.type)) continue;
    issues.push(...validateBpmnRelationship(model, rel.id));
  }
  return issues;
}

// ------------------------------
// Rule parts (exported for unit testing)
// ------------------------------

export function isSupportedBpmnRelationshipType(type: string): boolean {
  return (
    type === 'bpmn.sequenceFlow' ||
    type === 'bpmn.messageFlow' ||
    type === 'bpmn.association' ||
    type === 'bpmn.dataInputAssociation' ||
    type === 'bpmn.dataOutputAssociation'
  );
}

export function validateBpmnRelationship(model: Model, relationshipId: string): ValidationIssue[] {
  const rel = model.relationships[relationshipId];
  if (!rel) return [];
  if (!isSupportedBpmnRelationshipType(rel.type)) return [];

  const issues: ValidationIssue[] = [];
  const endpoints = getRelationshipEndpoints(model, relationshipId);
  if (!endpoints) {
    issues.push(
      makeIssue(
        'warning',
        `BPMN relationship ${relationshipId} should have both source and target set.`,
        { kind: 'relationship', relationshipId },
        `bpmn-rel-missing-endpoints:${relationshipId}`
      )
    );
    return issues;
  }

  const { src, tgt } = endpoints;
  const kindIssues = validateBpmnEndpointKinds(relationshipId, src, tgt);
  if (kindIssues.length) return kindIssues;

  issues.push(...validateBpmnMatrix(relationshipId, rel.type, src.type, tgt.type));
  issues.push(...validateBpmnSequenceFlow(model, relationshipId, rel.type, src.id, src.type, tgt.id, tgt.type));
  issues.push(...validateBpmnMessageFlow(model, relationshipId, rel.type, src.id, src.type, tgt.id, tgt.type));
  return issues;
}

type BpmnEndpointEl = { id: string; type: string; kind?: string };

function getRelationshipEndpoints(
  model: Model,
  relationshipId: string
): { src: BpmnEndpointEl; tgt: BpmnEndpointEl } | undefined {
  const rel = model.relationships[relationshipId];
  if (!rel?.sourceElementId || !rel?.targetElementId) return undefined;
  const src = model.elements[rel.sourceElementId];
  const tgt = model.elements[rel.targetElementId];
  if (!src || !tgt) return undefined;
  return { src, tgt };
}

function validateBpmnEndpointKinds(relationshipId: string, src: { type: string; kind?: string }, tgt: { type: string; kind?: string }): ValidationIssue[] {
  const srcKind = src.kind ?? kindFromTypeId(src.type);
  const tgtKind = tgt.kind ?? kindFromTypeId(tgt.type);

  // Keep behavior identical to the original validator: treat non-bpmn endpoints as warnings.
  if (srcKind !== 'bpmn' || tgtKind !== 'bpmn') {
    return [
      makeIssue(
        'warning',
        `BPMN relationship ${relationshipId} should connect two BPMN elements.`,
        { kind: 'relationship', relationshipId },
        `bpmn-rel-nonbpmn-endpoint:${relationshipId}`
      ),
    ];
  }
  return [];
}

function validateBpmnMatrix(
  relationshipId: string,
  relationshipType: string,
  sourceType: string,
  targetType: string
): ValidationIssue[] {
  // The palette matrix is typed against the domain unions (RelationshipType/ElementType).
  // At validation time we operate on runtime strings, so we cast after earlier narrowing.
  const m = validateBpmnRelationshipByMatrix({
    relationshipType: relationshipType as RelationshipType,
    sourceType: sourceType as ElementType,
    targetType: targetType as ElementType,
  });
  if (m.allowed !== false) return [];
  return [
    makeIssue(
      'warning',
      `${m.reason}${m.allowedTypes.length ? ` Allowed types: ${m.allowedTypes.join(', ')}.` : ''}`,
      { kind: 'relationship', relationshipId },
      `bpmn-rel-matrix-disallowed:${relationshipId}`
    ),
  ];
}

function collectPoolRects(model: Model, viewId: string): Rect[] {
  const view = model.views[viewId];
  if (!view) return [];
  const poolRects: Rect[] = [];
  for (const n of view.layout?.nodes ?? []) {
    if (!n.elementId) continue;
    const el = model.elements[n.elementId];
    if (el?.type === 'bpmn.pool') poolRects.push(rectForNode(n));
  }
  return poolRects;
}

function validateBpmnSequenceFlow(
  model: Model,
  relationshipId: string,
  relationshipType: string,
  srcId: string,
  srcType: string,
  tgtId: string,
  tgtType: string
): ValidationIssue[] {
  if (relationshipType !== 'bpmn.sequenceFlow') return [];

  const issues: ValidationIssue[] = [];
  if (!isBpmnFlowNodeType(srcType) || !isBpmnFlowNodeType(tgtType)) {
    issues.push(
      makeIssue(
        'warning',
        `Sequence Flow ${relationshipId} should connect BPMN flow nodes (not Pools/Lanes/Annotations).`,
        { kind: 'relationship', relationshipId },
        `bpmn-seqflow-nonflownode-endpoint:${relationshipId}`
      )
    );
  }

  const viewId = firstBpmnViewWithBothEndpoints(model, srcId, tgtId);
  if (!viewId) return issues;
  const view = model.views[viewId];
  const poolRects = collectPoolRects(model, viewId);
  if (!poolRects.length || !view) return issues;

  const sp = poolOfElementInView({ model, viewId, elementId: srcId, poolRects });
  const tp = poolOfElementInView({ model, viewId, elementId: tgtId, poolRects });
  if (sp && tp && sp !== tp) {
    issues.push(
      makeIssue(
        'warning',
        `Sequence Flow ${relationshipId} should not cross Pool boundaries in view "${view.name}".`,
        { kind: 'relationship', relationshipId },
        `bpmn-seqflow-cross-pool:${viewId}:${relationshipId}`
      )
    );
  }
  return issues;
}

function validateBpmnMessageFlow(
  model: Model,
  relationshipId: string,
  relationshipType: string,
  srcId: string,
  srcType: string,
  tgtId: string,
  tgtType: string
): ValidationIssue[] {
  if (relationshipType !== 'bpmn.messageFlow') return [];

  const issues: ValidationIssue[] = [];
  if (!isBpmnFlowNodeType(srcType) || !isBpmnFlowNodeType(tgtType)) {
    issues.push(
      makeIssue(
        'warning',
        `Message Flow ${relationshipId} should connect BPMN flow nodes (not Pools/Lanes/Annotations).`,
        { kind: 'relationship', relationshipId },
        `bpmn-msgflow-nonflownode-endpoint:${relationshipId}`
      )
    );
  }

  const viewId = firstBpmnViewWithBothEndpoints(model, srcId, tgtId);
  if (!viewId) return issues;
  const view = model.views[viewId];
  if (!view) return issues;

  const poolRects = collectPoolRects(model, viewId);
  if (!poolRects.length) {
    issues.push(
      makeIssue(
        'warning',
        `Message Flow ${relationshipId} is usually used between Pools; no Pools found in view "${view.name}".`,
        { kind: 'relationship', relationshipId },
        `bpmn-msgflow-no-pools:${viewId}:${relationshipId}`
      )
    );
    return issues;
  }

  const sp = poolOfElementInView({ model, viewId, elementId: srcId, poolRects });
  const tp = poolOfElementInView({ model, viewId, elementId: tgtId, poolRects });
  if (sp && tp) {
    if (sp === tp) {
      issues.push(
        makeIssue(
          'warning',
          `Message Flow ${relationshipId} is usually used between different Pools/Participants (view "${view.name}").`,
          { kind: 'relationship', relationshipId },
          `bpmn-msgflow-same-pool:${viewId}:${relationshipId}`
        )
      );
    }
  } else {
    issues.push(
      makeIssue(
        'warning',
        `Message Flow ${relationshipId} is usually used between Pools; place endpoints inside Pools in view "${view.name}".`,
        { kind: 'relationship', relationshipId },
        `bpmn-msgflow-missing-pool:${viewId}:${relationshipId}`
      )
    );
  }

  return issues;
}

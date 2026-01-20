import type { Model } from '../../../types';
import { kindFromTypeId } from '../../../kindFromTypeId';
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
    if (rel.type !== 'bpmn.sequenceFlow' && rel.type !== 'bpmn.messageFlow') continue;

    const src = rel.sourceElementId ? model.elements[rel.sourceElementId] : undefined;
    const tgt = rel.targetElementId ? model.elements[rel.targetElementId] : undefined;

    if (!src || !tgt) {
      issues.push(
        makeIssue(
          'warning',
          `BPMN relationship ${rel.id} should have both source and target set.`,
          { kind: 'relationship', relationshipId: rel.id },
          `bpmn-rel-missing-endpoints:${rel.id}`
        )
      );
      continue;
    }

    const srcKind = src.kind ?? kindFromTypeId(src.type);
    const tgtKind = tgt.kind ?? kindFromTypeId(tgt.type);

    // Keep behavior identical to the original validator: treat non-bpmn endpoints as warnings.
    if (srcKind !== 'bpmn' || tgtKind !== 'bpmn') {
      issues.push(
        makeIssue(
          'warning',
          `BPMN relationship ${rel.id} should connect two BPMN elements.`,
          { kind: 'relationship', relationshipId: rel.id },
          `bpmn-rel-nonbpmn-endpoint:${rel.id}`
        )
      );
      continue;
    }

    if (rel.type === 'bpmn.sequenceFlow') {
      if (!isBpmnFlowNodeType(src.type) || !isBpmnFlowNodeType(tgt.type)) {
        issues.push(
          makeIssue(
            'warning',
            `Sequence Flow ${rel.id} should connect BPMN flow nodes (not Pools/Lanes/Annotations).`,
            { kind: 'relationship', relationshipId: rel.id },
            `bpmn-seqflow-nonflownode-endpoint:${rel.id}`
          )
        );
      }

      const viewId = firstBpmnViewWithBothEndpoints(model, src.id, tgt.id);
      if (viewId) {
        const view = model.views[viewId];
        const poolRects: Rect[] = [];
        for (const n of view.layout?.nodes ?? []) {
          if (!n.elementId) continue;
          const el = model.elements[n.elementId];
          if (el?.type === 'bpmn.pool') poolRects.push(rectForNode(n));
        }

        if (poolRects.length) {
          const sp = poolOfElementInView({ model, viewId, elementId: src.id, poolRects });
          const tp = poolOfElementInView({ model, viewId, elementId: tgt.id, poolRects });
          if (sp && tp && sp !== tp) {
            issues.push(
              makeIssue(
                'warning',
                `Sequence Flow ${rel.id} should not cross Pool boundaries in view "${view.name}".`,
                { kind: 'relationship', relationshipId: rel.id },
                `bpmn-seqflow-cross-pool:${viewId}:${rel.id}`
              )
            );
          }
        }
      }
    }

    if (rel.type === 'bpmn.messageFlow') {
      if (!isBpmnFlowNodeType(src.type) || !isBpmnFlowNodeType(tgt.type)) {
        issues.push(
          makeIssue(
            'warning',
            `Message Flow ${rel.id} should connect BPMN flow nodes (not Pools/Lanes/Annotations).`,
            { kind: 'relationship', relationshipId: rel.id },
            `bpmn-msgflow-nonflownode-endpoint:${rel.id}`
          )
        );
      }

      const viewId = firstBpmnViewWithBothEndpoints(model, src.id, tgt.id);
      if (viewId) {
        const view = model.views[viewId];
        const poolRects: Rect[] = [];
        for (const n of view.layout?.nodes ?? []) {
          if (!n.elementId) continue;
          const el = model.elements[n.elementId];
          if (el?.type === 'bpmn.pool') poolRects.push(rectForNode(n));
        }

        if (poolRects.length) {
          const sp = poolOfElementInView({ model, viewId, elementId: src.id, poolRects });
          const tp = poolOfElementInView({ model, viewId, elementId: tgt.id, poolRects });
          if (sp && tp) {
            if (sp === tp) {
              issues.push(
                makeIssue(
                  'warning',
                  `Message Flow ${rel.id} is usually used between different Pools/Participants (view "${view.name}").`,
                  { kind: 'relationship', relationshipId: rel.id },
                  `bpmn-msgflow-same-pool:${viewId}:${rel.id}`
                )
              );
            }
          } else {
            issues.push(
              makeIssue(
                'warning',
                `Message Flow ${rel.id} is usually used between Pools; place endpoints inside Pools in view "${view.name}".`,
                { kind: 'relationship', relationshipId: rel.id },
                `bpmn-msgflow-missing-pool:${viewId}:${rel.id}`
              )
            );
          }
        } else {
          issues.push(
            makeIssue(
              'warning',
              `Message Flow ${rel.id} is usually used between Pools; no Pools found in view "${view.name}".`,
              { kind: 'relationship', relationshipId: rel.id },
              `bpmn-msgflow-no-pools:${viewId}:${rel.id}`
            )
          );
        }
      }
    }

    // Best-effort pool crossing rule for sequence flows (warning-first).
    // Note: preserved from the original implementation even though it duplicates the earlier check.
    if (rel.type === 'bpmn.sequenceFlow') {
      const viewId = firstBpmnViewWithBothEndpoints(model, src.id, tgt.id);
      if (!viewId) continue;
      const view = model.views[viewId];
      const poolRects: Rect[] = [];
      for (const n of view.layout?.nodes ?? []) {
        if (!n.elementId) continue;
        const el = model.elements[n.elementId];
        if (el?.type === 'bpmn.pool') poolRects.push(rectForNode(n));
      }
      if (!poolRects.length) continue;
      const sp = poolOfElementInView({ model, viewId, elementId: src.id, poolRects });
      const tp = poolOfElementInView({ model, viewId, elementId: tgt.id, poolRects });
      if (sp && tp && sp !== tp) {
        issues.push(
          makeIssue(
            'warning',
            `Sequence Flow ${rel.id} should not cross Pool boundaries in view "${view.name}".`,
            { kind: 'relationship', relationshipId: rel.id },
            `bpmn-seqflow-cross-pool:${viewId}:${rel.id}`
          )
        );
      }
    }
  }

  return issues;
}

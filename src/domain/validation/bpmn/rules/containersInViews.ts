import type { Model } from '../../../types';
import { kindFromTypeId } from '../../../kindFromTypeId';
import { makeIssue } from '../../issues';
import type { ValidationIssue } from '../../types';
import { centerOf, pickSmallestContaining, rectForNode, type Rect } from '../shared';

/**
 * Pools/Lanes as containers (per BPMN view).
 */
export function ruleContainersInViews(model: Model): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const view of Object.values(model.views)) {
    if (view.kind !== 'bpmn') continue;
    const nodes = view.layout?.nodes;
    if (!nodes?.length) continue;

    const poolRects: Rect[] = [];
    const laneRects: Rect[] = [];

    for (const n of nodes) {
      if (!n.elementId) continue;
      const el = model.elements[n.elementId];
      if (!el) continue;
      if (el.type === 'bpmn.pool') poolRects.push(rectForNode(n));
      if (el.type === 'bpmn.lane') laneRects.push(rectForNode(n));
    }

    if (!poolRects.length && !laneRects.length) continue;

    // Lanes should sit inside a Pool.
    for (const lane of laneRects) {
      const { cx, cy } = centerOf(lane);
      const pool = pickSmallestContaining(poolRects, cx, cy);
      if (!pool) {
        issues.push(
          makeIssue(
            'warning',
            `Lane should be inside a Pool in BPMN view "${view.name}".`,
            { kind: 'viewNode', viewId: view.id, elementId: lane.elementId },
            `bpmn-lane-not-in-pool:${view.id}:${lane.elementId}`
          )
        );
      }
    }

    // BPMN elements should be inside a Pool (and inside a Lane if lanes exist in that view).
    for (const n of nodes) {
      if (!n.elementId) continue;
      const el = model.elements[n.elementId];
      if (!el) continue;
      const kind = el.kind ?? kindFromTypeId(el.type);
      if (kind !== 'bpmn') continue;
      if (el.type === 'bpmn.pool' || el.type === 'bpmn.lane') continue;

      const r = rectForNode(n);
      const { cx, cy } = centerOf(r);
      const pool = pickSmallestContaining(poolRects, cx, cy);
      if (poolRects.length && !pool) {
        issues.push(
          makeIssue(
            'warning',
            `BPMN element should be placed inside a Pool in view "${view.name}".`,
            { kind: 'viewNode', viewId: view.id, elementId: n.elementId },
            `bpmn-el-not-in-pool:${view.id}:${n.elementId}`
          )
        );
        continue;
      }

      if (pool && laneRects.length) {
        // If lanes exist, require the element to be within at least one lane.
        const lane = pickSmallestContaining(laneRects, cx, cy);
        if (!lane) {
          issues.push(
            makeIssue(
              'warning',
              `BPMN element should be placed inside a Lane (lanes exist in view "${view.name}").`,
              { kind: 'viewNode', viewId: view.id, elementId: n.elementId },
              `bpmn-el-not-in-lane:${view.id}:${n.elementId}`
            )
          );
        }
      }
    }
  }

  return issues;
}

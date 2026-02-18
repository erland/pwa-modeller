import type { Model } from '../../../../types';
import { makeIssue } from '../../../issues';
import type { ValidationIssue } from '../../../types';
import { isBpmnFlowNodeType, isRecord } from './shared';

export function checkLaneFlowNodeRefs(model: Model): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Lanes -> flowNodeRefs
  const laneMembership: Record<string, string[]> = {};
  for (const el of Object.values(model.elements)) {
    if (el.type !== 'bpmn.lane') continue;
    const flowNodeRefsRaw = isRecord(el.attrs) ? el.attrs['flowNodeRefs'] : undefined;
    const flowNodeRefs = Array.isArray(flowNodeRefsRaw) ? flowNodeRefsRaw : [];
    const ids = flowNodeRefs.filter((v) => typeof v === 'string') as string[];

    for (const id of ids) {
      (laneMembership[id] ||= []).push(el.id);
      const target = model.elements[id];
      if (!target) {
        issues.push(
          makeIssue(
            'warning',
            `Lane ${el.id} references flow node ${id} but that element does not exist.`,
            { kind: 'element', elementId: el.id },
            `bpmn-lane-missing-flownode:${el.id}:${id}`
          )
        );
        continue;
      }
      if (!isBpmnFlowNodeType(target.type)) {
        issues.push(
          makeIssue(
            'warning',
            `Lane ${el.id} should only contain BPMN flow nodes; ${id} is ${target.type}.`,
            { kind: 'element', elementId: el.id },
            `bpmn-lane-nonflownode:${el.id}:${id}`
          )
        );
      }
    }
  }

  // Warn if a flow node is assigned to multiple lanes (common source of confusion).
  for (const [nodeId, lanes] of Object.entries(laneMembership)) {
    if (lanes.length <= 1) continue;
    issues.push(
      makeIssue(
        'warning',
        `Flow node ${nodeId} is contained in multiple lanes (${lanes.join(', ')}).`,
        { kind: 'element', elementId: nodeId },
        `bpmn-multi-lane-membership:${nodeId}`
      )
    );
  }

  return issues;
}

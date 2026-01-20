import type { Model } from '../../../types';
import { makeIssue } from '../../issues';
import type { ValidationIssue } from '../../types';

/**
 * Layout node invariants:
 * - node must reference exactly one of elementId/connectorId/objectId
 * - referenced element/connector/object should exist
 */
export function validateCommonViewLayoutNodes(model: Model): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const view of Object.values(model.views)) {
    const layout = view.layout;
    if (!layout) continue;

    for (const n of layout.nodes) {
      const hasEl = !!n.elementId;
      const hasCo = !!n.connectorId;
      const hasObj = !!n.objectId;

      const endpointCount = (hasEl ? 1 : 0) + (hasCo ? 1 : 0) + (hasObj ? 1 : 0);
      if (endpointCount !== 1) {
        issues.push(
          makeIssue(
            'error',
            `View ${view.name} (${view.id}) has an invalid node layout entry (must reference exactly one of elementId/connectorId/objectId).`,
            { kind: 'view', viewId: view.id },
            `view-node-xor:${view.id}:${(n.elementId ?? n.connectorId ?? n.objectId ?? 'unknown')}:${n.x},${n.y}`
          )
        );
        continue;
      }

      if (n.elementId) {
        if (!model.elements[n.elementId]) {
          issues.push(
            makeIssue(
              'warning',
              `View ${view.name} (${view.id}) contains a node for missing element: ${n.elementId}`,
              { kind: 'viewNode', viewId: view.id, elementId: n.elementId },
              `view-missing-node-el:${view.id}:${n.elementId}`
            )
          );
        }
      } else if (n.connectorId) {
        if (!(model.connectors ?? {})[n.connectorId]) {
          issues.push(
            makeIssue(
              'warning',
              `View ${view.name} (${view.id}) contains a node for missing connector: ${n.connectorId}`,
              { kind: 'view', viewId: view.id },
              `view-missing-node-connector:${view.id}:${n.connectorId}`
            )
          );
        }
      } else if (n.objectId) {
        if (!(view.objects ?? {})[n.objectId]) {
          issues.push(
            makeIssue(
              'warning',
              `View ${view.name} (${view.id}) contains a node for missing view object: ${n.objectId}`,
              { kind: 'view', viewId: view.id },
              `view-missing-node-object:${view.id}:${n.objectId}`
            )
          );
        }
      }
    }
  }

  return issues;
}

import type { Model } from '../../../types';
import { makeIssue } from '../../issues';
import type { ValidationIssue } from '../../types';

/**
 * Relationship layout entries:
 * - referenced relationship should exist
 * - relationship endpoints should exist as nodes within the view
 */
export function validateCommonViewLayoutRelationships(model: Model): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const view of Object.values(model.views)) {
    const layout = view.layout;
    if (!layout) continue;

    const nodeElementIds = layout.nodes.flatMap((n) => (n.elementId ? [n.elementId] : []));
    const nodeConnectorIds = layout.nodes.flatMap((n) => (n.connectorId ? [n.connectorId] : []));
    const nodeElementSet = new Set(nodeElementIds);
    const nodeConnectorSet = new Set(nodeConnectorIds);

    for (const r of layout.relationships) {
      const rel = model.relationships[r.relationshipId];
      if (!rel) {
        issues.push(
          makeIssue(
            'warning',
            `View ${view.name} (${view.id}) references missing relationship: ${r.relationshipId}`,
            { kind: 'view', viewId: view.id },
            `view-missing-rel:${view.id}:${r.relationshipId}`
          )
        );
        continue;
      }

      // If relationship exists but its endpoints are not present in the view nodes,
      // warn (diagram won't be able to render it meaningfully).
      const srcOk = rel.sourceElementId
        ? nodeElementSet.has(rel.sourceElementId)
        : rel.sourceConnectorId
          ? nodeConnectorSet.has(rel.sourceConnectorId)
          : false;
      const tgtOk = rel.targetElementId
        ? nodeElementSet.has(rel.targetElementId)
        : rel.targetConnectorId
          ? nodeConnectorSet.has(rel.targetConnectorId)
          : false;

      if (!srcOk || !tgtOk) {
        issues.push(
          makeIssue(
            'warning',
            `View ${view.name} (${view.id}) has relationship ${rel.id} but one or both endpoints are not in the view.`,
            { kind: 'view', viewId: view.id },
            `view-rel-missing-endpoints:${view.id}:${rel.id}`
          )
        );
      }
    }
  }

  return issues;
}

import type { Model } from '../../../types';
import { listDuplicatesInLayout } from '../../layout';
import { makeIssue } from '../../issues';
import type { ValidationIssue } from '../../types';

/**
 * Duplicate entries inside a view layout (duplicate nodes/relationship refs).
 */
export function validateCommonViewLayoutDuplicates(model: Model): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const view of Object.values(model.views)) {
    const dupes = listDuplicatesInLayout(view.layout);

    for (const elId of dupes.nodeElementIds) {
      issues.push(
        makeIssue(
          'warning',
          `View ${view.name} (${view.id}) contains duplicate node for element: ${elId}`,
          { kind: 'view', viewId: view.id },
          `view-dupe-node:${view.id}:${elId}`
        )
      );
    }

    for (const cId of dupes.nodeConnectorIds) {
      issues.push(
        makeIssue(
          'warning',
          `View ${view.name} (${view.id}) contains duplicate node for connector: ${cId}`,
          { kind: 'view', viewId: view.id },
          `view-dupe-connector-node:${view.id}:${cId}`
        )
      );
    }

    for (const objId of dupes.nodeObjectIds) {
      issues.push(
        makeIssue(
          'warning',
          `View ${view.name} (${view.id}) contains duplicate node for view object: ${objId}`,
          { kind: 'view', viewId: view.id },
          `view-dupe-object-node:${view.id}:${objId}`
        )
      );
    }

    for (const relId of dupes.relationshipIds) {
      issues.push(
        makeIssue(
          'warning',
          `View ${view.name} (${view.id}) contains duplicate relationship reference: ${relId}`,
          { kind: 'view', viewId: view.id },
          `view-dupe-rel:${view.id}:${relId}`
        )
      );
    }
  }

  return issues;
}

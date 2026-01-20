import type { Model } from '../../../types';
import type { ValidationIssue } from '../../types';
import { validateExternalIdsForTarget, validateTaggedValuesForTarget } from '../../externalMetadata';

/**
 * Validate schema/extension fields (externalIds + taggedValues) for top-level
 * collections that support them.
 */
export function validateCommonSchemaExtensions(model: Model): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Model itself
  issues.push(...validateExternalIdsForTarget(model.externalIds, { kind: 'model' }, 'model', 'Model'));
  issues.push(...validateTaggedValuesForTarget(model.taggedValues, { kind: 'model' }, 'model', 'Model'));

  // Folders
  for (const folder of Object.values(model.folders)) {
    const label = `Folder ${folder.name} (${folder.id})`;
    issues.push(
      ...validateExternalIdsForTarget(
        folder.externalIds,
        { kind: 'folder', folderId: folder.id },
        `folder:${folder.id}`,
        label
      )
    );
    issues.push(
      ...validateTaggedValuesForTarget(
        folder.taggedValues,
        { kind: 'folder', folderId: folder.id },
        `folder:${folder.id}`,
        label
      )
    );
  }

  // Connectors
  for (const c of Object.values(model.connectors ?? {})) {
    const label = `Connector ${c.type} (${c.id})`;
    issues.push(
      ...validateExternalIdsForTarget(
        c.externalIds,
        { kind: 'connector', connectorId: c.id },
        `connector:${c.id}`,
        label
      )
    );
    issues.push(
      ...validateTaggedValuesForTarget(
        c.taggedValues,
        { kind: 'connector', connectorId: c.id },
        `connector:${c.id}`,
        label
      )
    );
  }

  return issues;
}

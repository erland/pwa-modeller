import type { Model } from '../../../types';
import { makeIssue } from '../../issues';
import type { ValidationIssue } from '../../types';

/**
 * Folder structural consistency:
 * - parent exists
 * - child folder ids exist
 * - referenced element/view ids exist
 */
export function validateCommonFolderStructure(model: Model): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const folder of Object.values(model.folders)) {
    if (folder.parentId && !model.folders[folder.parentId]) {
      issues.push(
        makeIssue(
          'error',
          `Folder ${folder.name} (${folder.id}) references missing parent folder: ${folder.parentId}`,
          { kind: 'folder', folderId: folder.id },
          `folder-missing-parent:${folder.id}`
        )
      );
    }

    for (const childFolderId of folder.folderIds) {
      if (!model.folders[childFolderId]) {
        issues.push(
          makeIssue(
            'error',
            `Folder ${folder.name} (${folder.id}) references missing child folder: ${childFolderId}`,
            { kind: 'folder', folderId: folder.id },
            `folder-missing-child:${folder.id}:${childFolderId}`
          )
        );
      }
    }

    for (const elId of folder.elementIds) {
      if (!model.elements[elId]) {
        issues.push(
          makeIssue(
            'warning',
            `Folder ${folder.name} (${folder.id}) references missing element: ${elId}`,
            { kind: 'folder', folderId: folder.id },
            `folder-missing-el:${folder.id}:${elId}`
          )
        );
      }
    }

    for (const viewId of folder.viewIds) {
      if (!model.views[viewId]) {
        issues.push(
          makeIssue(
            'warning',
            `Folder ${folder.name} (${folder.id}) references missing view: ${viewId}`,
            { kind: 'folder', folderId: folder.id },
            `folder-missing-view:${folder.id}:${viewId}`
          )
        );
      }
    }
  }

  return issues;
}

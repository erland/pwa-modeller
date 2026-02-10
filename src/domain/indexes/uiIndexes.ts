import type { Model } from '../types';
import type { ElementChildrenIndex, ElementParentIndex } from './containmentPaths';
import type { ElementParentFolderIndex, FolderParentIndex } from './paths';
import { buildElementChildrenIndex, buildElementParentIndex } from './containmentPaths';
import { buildElementParentFolderIndex, buildFolderParentIndex } from './paths';

/**
 * Centralized indexes intended for UI/search callers.
 *
 * Keep this small. If you need heavy indexes, put them in analysis/portal layers.
 */
export type ModelUiIndexes = {
  folderParent: FolderParentIndex;
  elementParentFolder: ElementParentFolderIndex;
  elementParent: ElementParentIndex;
  elementChildren: ElementChildrenIndex;
};

export function buildModelUiIndexes(model: Model): ModelUiIndexes {
  const folderParent = buildFolderParentIndex(model);
  const elementParentFolder = buildElementParentFolderIndex(model);
  const elementParent = buildElementParentIndex(model);
  const elementChildren = buildElementChildrenIndex(model);
  return { folderParent, elementParentFolder, elementParent, elementChildren };
}

import type { Folder, Model } from '../../domain';
import { collectFolderSubtreeIds, tidyExternalIds } from '../../domain';
import {
  assertCanDeleteFolder,
  deleteElementInModel,
  deleteRelationshipInModel,
  deleteViewInModel,
  findFolderContainingElement,
  findFolderContainingView,
  getFolder,
  getView,
  tidyTaggedValuesFromUi
} from './helpers';

export function createFolder(model: Model, parentId: string, name: string): string {
  const id = `folder_${Math.random().toString(36).slice(2, 10)}`;
  const parent = getFolder(model, parentId);
  const folder: Folder = {
    id,
    name: name.trim(),
    kind: 'custom',
    parentId,
    folderIds: [],
    elementIds: [],
    relationshipIds: [],
    viewIds: []
  };

  model.folders = { ...model.folders, [folder.id]: folder };
  model.folders[parentId] = { ...parent, folderIds: [...parent.folderIds, folder.id] };
  return id;
}

export function moveElementToFolder(model: Model, elementId: string, targetFolderId: string): void {
  const fromId = findFolderContainingElement(model, elementId);
  if (!fromId) throw new Error(`Element not found in any folder: ${elementId}`);
  if (fromId === targetFolderId) return;

  const from = getFolder(model, fromId);
  const to = getFolder(model, targetFolderId);

  model.folders[fromId] = { ...from, elementIds: from.elementIds.filter((id) => id !== elementId) };
  model.folders[targetFolderId] = { ...to, elementIds: [...to.elementIds, elementId] };
}

export function moveViewToFolder(model: Model, viewId: string, targetFolderId: string): void {
  const view = getView(model, viewId);
  const fromId = findFolderContainingView(model, viewId);

    const ownedElementId =
    view.ownerRef?.kind === 'archimate' && model.elements[view.ownerRef.id] ? view.ownerRef.id : undefined;

  // If the view is currently owned by an element (or legacy-centered), it might not be in any folder.
  if (!fromId && !ownedElementId) {
    throw new Error(`View not found in any folder: ${viewId}`);
  }

  // If already in the target folder and not centered, nothing to do.
  if (fromId === targetFolderId && !ownedElementId) return;

  // Remove from the previous folder (if any).
  if (fromId) {
    const from = getFolder(model, fromId);
    model.folders[fromId] = { ...from, viewIds: from.viewIds.filter((id) => id !== viewId) };
  }

  // Clear ownership/centering when moving to a folder.
  if (ownedElementId) {
        model.views[viewId] = { ...view, ownerRef: undefined };
  }

  // Ensure not duplicated in any folder list (defensive).
  for (const fid of Object.keys(model.folders)) {
    const f = model.folders[fid];
    if (f.viewIds.includes(viewId) && fid != targetFolderId) {
      model.folders[fid] = { ...f, viewIds: f.viewIds.filter((id) => id !== viewId) };
    }
  }

  const to = getFolder(model, targetFolderId);
  if (!to.viewIds.includes(viewId)) {
    model.folders[targetFolderId] = { ...to, viewIds: [...to.viewIds, viewId] };
  }
}

export function moveViewToElement(model: Model, viewId: string, elementId: string): void {
  // Ensure both ids exist.
  if (!model.elements[elementId]) throw new Error(`Element not found: ${elementId}`);
  const view = getView(model, viewId);

  // Remove from any folder it might currently be in.
  for (const fid of Object.keys(model.folders)) {
    const f = model.folders[fid];
    if (f.viewIds.includes(viewId)) {
      model.folders[fid] = { ...f, viewIds: f.viewIds.filter((id) => id !== viewId) };
    }
  }

  // Update placement on the view.
  model.views[viewId] = { ...view, ownerRef: { kind: 'archimate', id: elementId } };
}

export function moveFolderToFolder(model: Model, folderId: string, targetFolderId: string): void {
  const folder = getFolder(model, folderId);
  const targetFolder = getFolder(model, targetFolderId);

  if (folderId === targetFolderId) return;
  if (folder.kind === 'root') throw new Error('Cannot move the root folder.');

  const fromParentId = folder.parentId;
  if (!fromParentId) throw new Error(`Cannot move folder without parent: ${folderId}`);

  // Prevent cycles: target cannot be the folder itself or any of its descendants.
  const subtreeIds = collectFolderSubtreeIds(model, folderId);
  if (subtreeIds.includes(targetFolderId)) {
    throw new Error('Cannot move a folder into itself (or its descendant).');
  }

  if (fromParentId === targetFolderId) return;

  const fromParent = getFolder(model, fromParentId);

  // Remove from old parent.
  fromParent.folderIds = fromParent.folderIds.filter((id) => id !== folderId);

  // Add to target parent (dedupe).
  if (!targetFolder.folderIds.includes(folderId)) {
    targetFolder.folderIds = [...targetFolder.folderIds, folderId];
  }

  // Update parent pointer.
  folder.parentId = targetFolderId;
}

// -------------------------
// Folder extensions (taggedValues/externalIds)
// -------------------------

export function updateFolder(model: Model, folderId: string, patch: Partial<Omit<Folder, 'id'>>): void {
  const current = getFolder(model, folderId);
  const merged: Folder = { ...current, ...patch, id: current.id };

  model.folders[folderId] = {
    ...merged,
    externalIds: tidyExternalIds(merged.externalIds),
    taggedValues: tidyTaggedValuesFromUi(merged.taggedValues)
  };
}

export function renameFolder(model: Model, folderId: string, name: string): void {
  const folder = getFolder(model, folderId);
  if (folder.kind === 'root') {
    throw new Error('Cannot rename root folder');
  }
  model.folders[folderId] = { ...folder, name: name.trim() };
}

/**
 * Deletes a folder.
 *
 * Default behavior (no options): contents and child folders are moved to the parent folder.
 *
 * Options:
 * - { mode: 'move', targetFolderId }: move contents and child folders to the given folder
 *   (must not be inside the deleted folder subtree).
 * - { mode: 'deleteContents' }: delete the entire folder subtree and all contained elements/views.
 */
export function deleteFolder(
  model: Model,
  folderId: string,
  options?: { mode?: 'move'; targetFolderId?: string } | { mode: 'deleteContents' }
): void {
  assertCanDeleteFolder(model, folderId);
  const folder = getFolder(model, folderId);
  const parentId = folder.parentId;
  if (!parentId) throw new Error('Cannot delete folder without parent');

  // Delete subtree contents (and the subtree folders themselves).
  if (options && 'mode' in options && options.mode === 'deleteContents') {
    const folderIdsToDelete = collectFolderSubtreeIds(model, folderId);
    const elementIds = new Set<string>();
    const relationshipIds = new Set<string>();
    const viewIds = new Set<string>();

    for (const fid of folderIdsToDelete) {
      const f = model.folders[fid];
      if (!f) continue;
      for (const eid of f.elementIds) elementIds.add(eid);
      for (const rid of f.relationshipIds) relationshipIds.add(rid);
      for (const vid of f.viewIds) viewIds.add(vid);
    }

    // Delete elements first (also deletes related relationships and removes from views).
    for (const eid of elementIds) deleteElementInModel(model, eid);

    // Delete relationships explicitly contained in the folder subtree.
    for (const rid of relationshipIds) deleteRelationshipInModel(model, rid);

    // Delete views next.
    for (const vid of viewIds) deleteViewInModel(model, vid);

    // Remove from parent
    const parent = getFolder(model, parentId);
    model.folders[parentId] = { ...parent, folderIds: parent.folderIds.filter((id) => id !== folderId) };

    // Remove folder objects
    const nextFolders = { ...model.folders };
    for (const fid of folderIdsToDelete) delete nextFolders[fid];
    model.folders = nextFolders;
    return;
  }

  // Otherwise: move contents/children to a target folder (default: parent).
  const subtree = new Set(collectFolderSubtreeIds(model, folderId));
  const requestedTargetId =
    options && 'mode' in options && (options.mode ?? 'move') === 'move' ? options.targetFolderId : undefined;
  const targetId = requestedTargetId && !subtree.has(requestedTargetId) ? requestedTargetId : parentId;

  const parent = getFolder(model, parentId);

  if (targetId === parentId) {
    // Move children and contents to parent.
    const nextParent: Folder = {
      ...parent,
      folderIds: [...parent.folderIds.filter((id) => id !== folderId), ...folder.folderIds],
      elementIds: [...parent.elementIds, ...folder.elementIds],
      viewIds: [...parent.viewIds, ...folder.viewIds]
    };
    model.folders[parentId] = nextParent;

    // Reparent children folders.
    for (const childId of folder.folderIds) {
      const child = getFolder(model, childId);
      model.folders[childId] = { ...child, parentId };
    }
  } else {
    const target = getFolder(model, targetId);

    // Remove folder from its parent list
    model.folders[parentId] = { ...parent, folderIds: parent.folderIds.filter((id) => id !== folderId) };

    // Move children and contents to target
    model.folders[targetId] = {
      ...target,
      folderIds: [...target.folderIds, ...folder.folderIds],
      elementIds: [...target.elementIds, ...folder.elementIds],
      viewIds: [...target.viewIds, ...folder.viewIds]
    };

    // Reparent children folders.
    for (const childId of folder.folderIds) {
      const child = getFolder(model, childId);
      model.folders[childId] = { ...child, parentId: targetId };
    }
  }

  const rest = { ...model.folders };
  delete rest[folderId];
  model.folders = rest;
}

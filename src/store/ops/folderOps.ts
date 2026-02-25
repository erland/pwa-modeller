import type { Folder, Model } from '../../domain';
import type { TouchedIds } from '../changeSet';
import { folderMutations } from '../mutations';
import { findFolderIdByKind } from '../mutations/helpers';
import { touch } from '../touch';

export type FolderOpsDeps = {
  updateModel: (mutator: (model: Model) => void, markDirty?: boolean) => void;
  recordTouched: (touched: TouchedIds) => void;
};

export const createFolderOps = (deps: FolderOpsDeps) => {
  const { updateModel, recordTouched } = deps;

  const createFolder = (parentId: string, name: string): string => {
    let created = '';
    updateModel((model) => {
      created = folderMutations.createFolder(model, parentId, name);
    });
    if (created) recordTouched(touch.folderUpserts(created));
    return created;
  };

  const moveElementToFolder = (elementId: string, targetFolderId: string): void => {
    updateModel((model) => folderMutations.moveElementToFolder(model, elementId, targetFolderId));
    recordTouched(touch.combine(touch.elementUpserts(elementId), touch.folderUpserts(targetFolderId)));
  };

  const moveViewToFolder = (viewId: string, targetFolderId: string): void => {
    updateModel((model) => folderMutations.moveViewToFolder(model, viewId, targetFolderId));
    recordTouched(touch.combine(touch.viewUpserts(viewId), touch.folderUpserts(targetFolderId)));
  };

  const moveViewToElement = (viewId: string, elementId: string): void => {
    updateModel((model) => folderMutations.moveViewToElement(model, viewId, elementId));
    recordTouched(touch.combine(touch.viewUpserts(viewId), touch.elementUpserts(elementId)));
  };

  const moveFolderToFolder = (folderId: string, targetFolderId: string): void => {
    updateModel((model) => folderMutations.moveFolderToFolder(model, folderId, targetFolderId));
    recordTouched(touch.folderUpserts(folderId, targetFolderId));
  };

  const updateFolder = (folderId: string, patch: Partial<Omit<Folder, 'id'>>): void => {
    updateModel((model) => folderMutations.updateFolder(model, folderId, patch));
    recordTouched(touch.folderUpserts(folderId));
  };

  const renameFolder = (folderId: string, name: string): void => {
    updateModel((model) => folderMutations.renameFolder(model, folderId, name));
    recordTouched(touch.folderUpserts(folderId));
  };

  const deleteFolder = (
    folderId: string,
    options?: { mode?: 'move'; targetFolderId?: string } | { mode: 'deleteContents' }
  ): void => {
    updateModel((model) => folderMutations.deleteFolder(model, folderId, options));
    recordTouched(touch.folderDeletes(folderId));
  };

  const ensureRootFolders = (): void => {
    updateModel(
      (model) => {
        // Will throw if missing, which is fine for now.
        findFolderIdByKind(model, 'root');
      },
      false
    );
  };

  return {
    createFolder,
    moveElementToFolder,
    moveViewToFolder,
    moveViewToElement,
    moveFolderToFolder,
    updateFolder,
    renameFolder,
    deleteFolder,
    ensureRootFolders,
  };
};
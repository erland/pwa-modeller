import type { Folder, Model } from '../../domain';
import type { TouchedIds } from '../changeSet';
import { folderMutations } from '../mutations';
import { findFolderIdByKind } from '../mutations/helpers';

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
    if (created) recordTouched({ folderUpserts: [created] });
    return created;
  };

  const moveElementToFolder = (elementId: string, targetFolderId: string): void => {
    updateModel((model) => folderMutations.moveElementToFolder(model, elementId, targetFolderId));
    recordTouched({ elementUpserts: [elementId], folderUpserts: [targetFolderId] });
  };

  const moveViewToFolder = (viewId: string, targetFolderId: string): void => {
    updateModel((model) => folderMutations.moveViewToFolder(model, viewId, targetFolderId));
    recordTouched({ viewUpserts: [viewId], folderUpserts: [targetFolderId] });
  };

  const moveViewToElement = (viewId: string, elementId: string): void => {
    updateModel((model) => folderMutations.moveViewToElement(model, viewId, elementId));
    recordTouched({ viewUpserts: [viewId], elementUpserts: [elementId] });
  };

  const moveFolderToFolder = (folderId: string, targetFolderId: string): void => {
    updateModel((model) => folderMutations.moveFolderToFolder(model, folderId, targetFolderId));
    recordTouched({ folderUpserts: [folderId, targetFolderId] });
  };

  const updateFolder = (folderId: string, patch: Partial<Omit<Folder, 'id'>>): void => {
    updateModel((model) => folderMutations.updateFolder(model, folderId, patch));
    recordTouched({ folderUpserts: [folderId] });
  };

  const renameFolder = (folderId: string, name: string): void => {
    updateModel((model) => folderMutations.renameFolder(model, folderId, name));
    recordTouched({ folderUpserts: [folderId] });
  };

  const deleteFolder = (
    folderId: string,
    options?: { mode?: 'move'; targetFolderId?: string } | { mode: 'deleteContents' }
  ): void => {
    updateModel((model) => folderMutations.deleteFolder(model, folderId, options));
    recordTouched({ folderDeletes: [folderId] });
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

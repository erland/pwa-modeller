import type { Folder } from '../../domain';

export type DatasetCommandsContext = {
  ops: {
    folderOps: {
      createFolder(parentId: string, name: string): string;
      moveElementToFolder(elementId: string, targetFolderId: string): void;
      moveViewToFolder(viewId: string, targetFolderId: string): void;
      moveViewToElement(viewId: string, elementId: string): void;
      moveFolderToFolder(folderId: string, targetFolderId: string): void;
      updateFolder(folderId: string, patch: Partial<Omit<Folder, 'id'>>): void;
      renameFolder(folderId: string, name: string): void;
      deleteFolder(
        folderId: string,
        options?: { mode?: 'move'; targetFolderId?: string } | { mode: 'deleteContents' }
      ): void;
      ensureRootFolders(): void;
    };
  };
  runInTransaction<T>(fn: () => T): T;
};

export function createDatasetCommands(ctx: DatasetCommandsContext) {
  return {
    // -------------------------
    // Folders (model structure)
    // -------------------------

    createFolder: (parentId: string, name: string): string =>
      ctx.runInTransaction(() => ctx.ops.folderOps.createFolder(parentId, name)),

    moveElementToFolder: (elementId: string, targetFolderId: string): void => {
      ctx.runInTransaction(() => ctx.ops.folderOps.moveElementToFolder(elementId, targetFolderId));
    },

    moveViewToFolder: (viewId: string, targetFolderId: string): void => {
      ctx.runInTransaction(() => ctx.ops.folderOps.moveViewToFolder(viewId, targetFolderId));
    },

    moveViewToElement: (viewId: string, elementId: string): void => {
      ctx.runInTransaction(() => ctx.ops.folderOps.moveViewToElement(viewId, elementId));
    },

    moveFolderToFolder: (folderId: string, targetFolderId: string): void => {
      ctx.runInTransaction(() => ctx.ops.folderOps.moveFolderToFolder(folderId, targetFolderId));
    },

    // -------------------------
    // Folder extensions (taggedValues/externalIds)
    // -------------------------

    updateFolder: (folderId: string, patch: Partial<Omit<Folder, 'id'>>): void => {
      ctx.runInTransaction(() => ctx.ops.folderOps.updateFolder(folderId, patch));
    },

    renameFolder: (folderId: string, name: string): void => {
      ctx.runInTransaction(() => ctx.ops.folderOps.renameFolder(folderId, name));
    },

    deleteFolder: (
      folderId: string,
      options?: { mode?: 'move'; targetFolderId?: string } | { mode: 'deleteContents' }
    ): void => {
      ctx.runInTransaction(() => ctx.ops.folderOps.deleteFolder(folderId, options));
    },

    /** Ensure a model has the root folder structure (used by future migrations). */
    ensureRootFolders: (): void => {
      ctx.runInTransaction(() => ctx.ops.folderOps.ensureRootFolders());
    },
  } satisfies Record<string, unknown>;
}

export type DatasetCommands = ReturnType<typeof createDatasetCommands>;

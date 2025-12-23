import type { Element, Folder, Model, ModelMetadata, Relationship, View } from '../domain';
import { createEmptyModel } from '../domain';

export type ModelStoreState = {
  model: Model | null;
  /** The last chosen file name (used as default for downloads). */
  fileName: string | null;
  /** Tracks if there are unsaved changes since last load/save. */
  isDirty: boolean;
};

type Listener = () => void;

function findFolderIdByKind(model: Model, kind: Folder['kind']): string {
  const folder = Object.values(model.folders).find((f) => f.kind === kind);
  if (!folder) throw new Error(`Model is missing required folder kind: ${kind}`);
  return folder.id;
}

function findFolderContainingElement(model: Model, elementId: string): string | null {
  for (const folder of Object.values(model.folders)) {
    if (folder.elementIds.includes(elementId)) return folder.id;
  }
  return null;
}

function findFolderContainingView(model: Model, viewId: string): string | null {
  for (const folder of Object.values(model.folders)) {
    if (folder.viewIds.includes(viewId)) return folder.id;
  }
  return null;
}

function getFolder(model: Model, folderId: string): Folder {
  const folder = model.folders[folderId];
  if (!folder) throw new Error(`Folder not found: ${folderId}`);
  return folder;
}

function assertCanDeleteFolder(model: Model, folderId: string): void {
  const folder = getFolder(model, folderId);
  if (folder.kind === 'root' || folder.kind === 'elements' || folder.kind === 'views') {
    throw new Error('Cannot delete root folders');
  }
}

export class ModelStore {
  private state: ModelStoreState = {
    model: null,
    fileName: null,
    isDirty: false
  };

  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): ModelStoreState {
    return this.state;
  }

  private setState(next: Partial<ModelStoreState>): void {
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) l();
  }

  private updateModel(mutator: (model: Model) => void, markDirty = true): void {
    const current = this.state.model;
    if (!current) throw new Error('No model loaded');

    // Shallow clone the model; inner objects are cloned as needed by operations.
    const nextModel: Model = {
      ...current,
      metadata: { ...current.metadata },
      elements: { ...current.elements },
      relationships: { ...current.relationships },
      views: { ...current.views },
      folders: { ...current.folders }
    };

    mutator(nextModel);
    this.setState({ model: nextModel, isDirty: markDirty ? true : this.state.isDirty });
  }

  /** Replace the current model. */
  loadModel(model: Model, fileName: string | null = null): void {
    this.setState({ model, fileName, isDirty: false });
  }

  reset(): void {
    this.setState({ model: null, fileName: null, isDirty: false });
  }

  newModel(metadata: ModelMetadata): void {
    const model = createEmptyModel(metadata);
    this.setState({ model, fileName: null, isDirty: false });
  }

  /** Backwards-compatible alias used by tests/earlier steps. */
  createEmptyModel(metadata: ModelMetadata): void {
    this.newModel(metadata);
  }

  setFileName(fileName: string | null): void {
    this.setState({ fileName });
  }

  markSaved(): void {
    this.setState({ isDirty: false });
  }

  updateModelMetadata(patch: Partial<ModelMetadata>): void {
    this.updateModel((model) => {
      model.metadata = { ...model.metadata, ...patch };
    });
  }

  // -------------------------
  // Elements
  // -------------------------

  addElement(element: Element, folderId?: string): void {
    this.updateModel((model) => {
      model.elements[element.id] = element;

      const targetFolderId = folderId ?? findFolderIdByKind(model, 'elements');
      const folder = getFolder(model, targetFolderId);
      if (!folder.elementIds.includes(element.id)) {
        model.folders[targetFolderId] = { ...folder, elementIds: [...folder.elementIds, element.id] };
      }
    });
  }

  updateElement(elementId: string, patch: Partial<Omit<Element, 'id'>>): void {
    this.updateModel((model) => {
      const current = model.elements[elementId];
      if (!current) throw new Error(`Element not found: ${elementId}`);
      model.elements[elementId] = { ...current, ...patch, id: current.id };
    });
  }

  deleteElement(elementId: string): void {
    this.updateModel((model) => {
      if (!model.elements[elementId]) return;

      // Remove element itself
      const nextElements = { ...model.elements };
      delete nextElements[elementId];
      model.elements = nextElements;

      // Remove from any folder that contains it
      for (const fid of Object.keys(model.folders)) {
        const f = model.folders[fid];
        if (f.elementIds.includes(elementId)) {
          model.folders[fid] = { ...f, elementIds: f.elementIds.filter((id) => id !== elementId) };
        }
      }

      // Remove relationships that reference it
      const relIdsToDelete = Object.values(model.relationships)
        .filter((r) => r.sourceElementId === elementId || r.targetElementId === elementId)
        .map((r) => r.id);

      if (relIdsToDelete.length > 0) {
        const nextRels = { ...model.relationships };
        for (const rid of relIdsToDelete) delete nextRels[rid];
        model.relationships = nextRels;
      }
    });
  }

  // -------------------------
  // Relationships
  // -------------------------

  addRelationship(relationship: Relationship): void {
    this.updateModel((model) => {
      model.relationships[relationship.id] = relationship;
    });
  }

  updateRelationship(relationshipId: string, patch: Partial<Omit<Relationship, 'id'>>): void {
    this.updateModel((model) => {
      const current = model.relationships[relationshipId];
      if (!current) throw new Error(`Relationship not found: ${relationshipId}`);
      model.relationships[relationshipId] = { ...current, ...patch, id: current.id };
    });
  }

  deleteRelationship(relationshipId: string): void {
    this.updateModel((model) => {
      if (!model.relationships[relationshipId]) return;
      const next = { ...model.relationships };
      delete next[relationshipId];
      model.relationships = next;
    });
  }

  // -------------------------
  // Views
  // -------------------------

  addView(view: View, folderId?: string): void {
    this.updateModel((model) => {
      model.views[view.id] = view;

      const targetFolderId = folderId ?? findFolderIdByKind(model, 'views');
      const folder = getFolder(model, targetFolderId);
      if (!folder.viewIds.includes(view.id)) {
        model.folders[targetFolderId] = { ...folder, viewIds: [...folder.viewIds, view.id] };
      }
    });
  }

  updateView(viewId: string, patch: Partial<Omit<View, 'id'>>): void {
    this.updateModel((model) => {
      const current = model.views[viewId];
      if (!current) throw new Error(`View not found: ${viewId}`);
      model.views[viewId] = { ...current, ...patch, id: current.id };
    });
  }

  deleteView(viewId: string): void {
    this.updateModel((model) => {
      if (!model.views[viewId]) return;

      const nextViews = { ...model.views };
      delete nextViews[viewId];
      model.views = nextViews;

      for (const fid of Object.keys(model.folders)) {
        const f = model.folders[fid];
        if (f.viewIds.includes(viewId)) {
          model.folders[fid] = { ...f, viewIds: f.viewIds.filter((id) => id !== viewId) };
        }
      }
    });
  }

  // -------------------------
  // Folders
  // -------------------------

  createFolder(parentId: string, name: string): string {
    const id = `folder_${Math.random().toString(36).slice(2, 10)}`;
    this.updateModel((model) => {
      const parent = getFolder(model, parentId);
      const folder: Folder = {
        id,
        name: name.trim(),
        kind: 'custom',
        parentId,
        folderIds: [],
        elementIds: [],
        viewIds: []
      };
      model.folders = { ...model.folders, [folder.id]: folder };
      model.folders[parentId] = { ...parent, folderIds: [...parent.folderIds, folder.id] };
    });
    return id;
  }

  moveElementToFolder(elementId: string, targetFolderId: string): void {
    this.updateModel((model) => {
      const fromId = findFolderContainingElement(model, elementId);
      if (!fromId) throw new Error(`Element not found in any folder: ${elementId}`);
      if (fromId === targetFolderId) return;

      const from = getFolder(model, fromId);
      const to = getFolder(model, targetFolderId);

      model.folders[fromId] = { ...from, elementIds: from.elementIds.filter((id) => id !== elementId) };
      model.folders[targetFolderId] = { ...to, elementIds: [...to.elementIds, elementId] };
    });
  }

  moveViewToFolder(viewId: string, targetFolderId: string): void {
    this.updateModel((model) => {
      const fromId = findFolderContainingView(model, viewId);
      if (!fromId) throw new Error(`View not found in any folder: ${viewId}`);
      if (fromId === targetFolderId) return;

      const from = getFolder(model, fromId);
      const to = getFolder(model, targetFolderId);

      model.folders[fromId] = { ...from, viewIds: from.viewIds.filter((id) => id !== viewId) };
      model.folders[targetFolderId] = { ...to, viewIds: [...to.viewIds, viewId] };
    });
  }

  renameFolder(folderId: string, name: string): void {
    this.updateModel((model) => {
      const folder = getFolder(model, folderId);
      if (folder.kind === 'root' || folder.kind === 'elements' || folder.kind === 'views') {
        throw new Error('Cannot rename root folders');
      }
      model.folders[folderId] = { ...folder, name: name.trim() };
    });
  }

  /**
   * Delete a folder, but do not delete model content.
   * Contents and child folders are moved to the parent.
   */
  deleteFolder(folderId: string): void {
    this.updateModel((model) => {
      assertCanDeleteFolder(model, folderId);
      const folder = getFolder(model, folderId);
      const parentId = folder.parentId;
      if (!parentId) throw new Error('Cannot delete folder without parent');
      const parent = getFolder(model, parentId);

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

      const rest = { ...model.folders };
      delete rest[folderId];
      model.folders = rest;
    });
  }

  /** Ensure a model has the root folder structure (used by future migrations). */
  ensureRootFolders(): void {
    this.updateModel(
      (model) => {
        // Will throw if missing, which is fine for now.
        findFolderIdByKind(model, 'root');
        findFolderIdByKind(model, 'elements');
        findFolderIdByKind(model, 'views');
      },
      false
    );
  }
}

/** Factory used by tests and to create isolated store instances. */
export function createModelStore(): ModelStore {
  return new ModelStore();
}

/** App singleton store instance. */
export const modelStore = createModelStore();
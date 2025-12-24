import type { Element, Folder, Model, ModelMetadata, Relationship, View, ViewLayout, ViewRelationshipLayout, ViewNodeLayout, ViewFormatting } from '../domain';
import { createEmptyModel, createView } from '../domain';

export type ModelStoreState = {
  model: Model | null;
  /** The last chosen file name (used as default for downloads). */
  fileName: string | null;
  /** Tracks if there are unsaved changes since last load/save. */
  isDirty: boolean;
};

type Listener = () => void;

type ViewWithLayout = View & { layout: ViewLayout };

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

function getView(model: Model, viewId: string): View {
  const view = model.views[viewId];
  if (!view) throw new Error(`View not found: ${viewId}`);
  return view;
}

function ensureViewLayout(view: View): ViewWithLayout {
  if (view.layout) return view as ViewWithLayout;
  return { ...view, layout: { nodes: [], relationships: [] } };
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

      // Remove any view layout nodes that reference the element, and
      // remove any view connections that reference deleted relationships.
      for (const view of Object.values(model.views)) {
        if (!view.layout) continue;
        const nextNodes = view.layout.nodes.filter((n) => n.elementId !== elementId);
        const nextConnections = view.layout.relationships.filter((c) => model.relationships[c.relationshipId]);
        if (nextNodes.length !== view.layout.nodes.length || nextConnections.length !== view.layout.relationships.length) {
          model.views[view.id] = {
            ...view,
            layout: {
              nodes: nextNodes,
              relationships: nextConnections
            }
          };
        }
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

      // Remove from any view layout connections.
      for (const view of Object.values(model.views)) {
        if (!view.layout) continue;
        const nextConnections = view.layout.relationships.filter((c) => c.relationshipId !== relationshipId);
        if (nextConnections.length !== view.layout.relationships.length) {
          model.views[view.id] = {
            ...view,
            layout: {
              nodes: view.layout.nodes,
              relationships: nextConnections
            }
          };
        }
      }
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
  updateViewFormatting(viewId: string, patch: Partial<ViewFormatting>): void {
    this.updateModel((model) => {
      const view = model.views[viewId];
      if (!view) return;

      const prev = view.formatting ?? { snapToGrid: true, gridSize: 20, layerStyleTags: {} };
      const next: ViewFormatting = {
        ...prev,
        ...patch,
        layerStyleTags: { ...(prev.layerStyleTags ?? {}), ...(patch.layerStyleTags ?? {}) }
      };

      model.views[viewId] = { ...view, formatting: next };
    });
  }

  /** Clone a view (including its layout) into the same folder as the original. Returns the new view id. */
  cloneView(viewId: string): string | null {
    let created: string | null = null;

    this.updateModel((model) => {
      const original = model.views[viewId];
      if (!original) return;

      const baseName = original.name.trim() || 'View';
      const existingNames = new Set(Object.values(model.views).map((v) => v.name));
      let name = `Copy of ${baseName}`;
      if (existingNames.has(name)) {
        let i = 2;
        while (existingNames.has(`${name} (${i})`)) i++;
        name = `${name} (${i})`;
      }

      const clone = createView({
        name,
        viewpointId: original.viewpointId,
        description: original.description,
        documentation: original.documentation,
        stakeholders: original.stakeholders ? [...original.stakeholders] : undefined,
        formatting: original.formatting ? JSON.parse(JSON.stringify(original.formatting)) : undefined,
        layout: original.layout ? JSON.parse(JSON.stringify(original.layout)) : undefined
      });

      model.views[clone.id] = clone;

      const folderId = findFolderContainingView(model, viewId) ?? findFolderIdByKind(model, 'views');
      model.folders[folderId] = {
        ...model.folders[folderId],
        viewIds: [...model.folders[folderId].viewIds, clone.id]
      };

      created = clone.id;
    });

    return created;
  }

  updateViewNodeLayout(viewId: string, elementId: string, patch: Partial<Omit<ViewNodeLayout, 'elementId'>>): void {
    this.updateModel((model) => {
      const view = model.views[viewId];
      if (!view) return;

      const viewWithLayout = ensureViewLayout(view);
      const idx = viewWithLayout.layout.nodes.findIndex((n) => n.elementId === elementId);
      if (idx < 0) return;

      const prev = viewWithLayout.layout.nodes[idx];
      const next: ViewNodeLayout = { ...prev, ...patch, elementId: prev.elementId };
      const nextNodes = viewWithLayout.layout.nodes.slice();
      nextNodes[idx] = next;

      model.views[viewId] = { ...viewWithLayout, layout: { ...viewWithLayout.layout, nodes: nextNodes } };
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
  // Diagram layout (per view)
  // -------------------------

  /** Adds an element to a view's layout as a positioned node (idempotent). */
addElementToView(viewId: string, elementId: string): string {
  this.updateModel((model) => {
    const view = model.views[viewId];
    if (!view) throw new Error(`View not found: ${viewId}`);
    const element = model.elements[elementId];
    if (!element) throw new Error(`Element not found: ${elementId}`);

    const viewWithLayout = ensureViewLayout(view);
    const layout = viewWithLayout.layout!;

    if (layout.nodes.some((n) => n.elementId === elementId)) return;

    const i = layout.nodes.length;
    const cols = 4;
    const x = 24 + (i % cols) * 160;
    const y = 24 + Math.floor(i / cols) * 110;

    const node: ViewNodeLayout = { elementId, x, y, width: 140, height: 70 };
    model.views[viewId] = {
      ...viewWithLayout,
      layout: { nodes: [...layout.nodes, node], relationships: layout.relationships }
    };
  });

  return elementId;
}

  removeElementFromView(viewId: string, elementId: string): void {
    this.updateModel((model) => {
      const view = getView(model, viewId);
      if (!view.layout) return;
      const layout = view.layout;
      const nextNodes = layout.nodes.filter((n) => n.elementId !== elementId);

      // Drop any connections whose relationship no longer exists.
      const nextConnections: ViewRelationshipLayout[] = layout.relationships.filter((c) => Boolean(model.relationships[c.relationshipId]));

      if (nextNodes.length === layout.nodes.length && nextConnections.length === layout.relationships.length) return;
      model.views[viewId] = { ...view, layout: { nodes: nextNodes, relationships: nextConnections } };
    });
  }

  updateViewNodePosition(viewId: string, elementId: string, x: number, y: number): void {
    this.updateModel((model) => {
      const view = getView(model, viewId);
      if (!view.layout) return;
      const layout = view.layout;
      const node = layout.nodes.find((n) => n.elementId === elementId);
      if (!node) return;
      const nextNodes = layout.nodes.map((n) => (n.elementId === elementId ? { ...n, x, y } : n));
      model.views[viewId] = { ...view, layout: { nodes: nextNodes, relationships: layout.relationships } };
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
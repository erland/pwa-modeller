import type {
  Element,
  Folder,
  Model,
  ModelMetadata,
  Relationship,
  View,
  ViewLayout,
  ViewRelationshipLayout,
  ViewNodeLayout,
  ViewFormatting,
  TaggedValue
} from '../domain';
import {
  createEmptyModel,
  createView,
  collectFolderSubtreeIds,
  createId,
  upsertTaggedValue,
  removeTaggedValue,
  sanitizeRelationshipAttrs,
  sanitizeUnknownTypeForElement,
  sanitizeUnknownTypeForRelationship
} from '../domain';

export type ModelStoreState = {
  model: Model | null;
  /** The last chosen file name (used as default for downloads). */
  fileName: string | null;
  /** Tracks if there are unsaved changes since last load/save. */
  isDirty: boolean;
};

type Listener = () => void;

type ViewWithLayout = View & { layout: ViewLayout };

type TaggedValueInput = Omit<TaggedValue, 'id'> & { id?: string };

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
  if (folder.kind === 'root') {
    throw new Error('Cannot delete root folder');
  }
}


function deleteViewInModel(model: Model, viewId: string): void {
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
}

function deleteRelationshipInModel(model: Model, relationshipId: string): void {
  if (!model.relationships[relationshipId]) return;

  const next = { ...model.relationships };
  delete next[relationshipId];
  model.relationships = next;

  // Remove from any folder that contains it.
  for (const fid of Object.keys(model.folders)) {
    const f = model.folders[fid] as any;
    const relIds: string[] | undefined = Array.isArray(f.relationshipIds) ? f.relationshipIds : undefined;
    if (relIds && relIds.includes(relationshipId)) {
      model.folders[fid] = { ...f, relationshipIds: relIds.filter((id) => id !== relationshipId) };
    }
  }

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
}

function deleteElementInModel(model: Model, elementId: string): void {
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

  // If there are views centered on this element, move them back to the root folder.
  const rootId = findFolderIdByKind(model, 'root');
  const rootFolder = getFolder(model, rootId);
  let rootViewIds = rootFolder.viewIds;
  let rootChanged = false;
  for (const view of Object.values(model.views)) {
    if (view.centerElementId === elementId) {
      model.views[view.id] = { ...view, centerElementId: undefined };
      if (!rootViewIds.includes(view.id)) {
        if (!rootChanged) rootViewIds = [...rootViewIds];
        rootViewIds.push(view.id);
        rootChanged = true;
      }
    }
  }
  if (rootChanged) {
    model.folders[rootId] = { ...rootFolder, viewIds: rootViewIds };
  }

  // Remove relationships that reference it
  const relIdsToDelete = Object.values(model.relationships)
    .filter((r) => r.sourceElementId === elementId || r.targetElementId === elementId)
    .map((r) => r.id);

  for (const rid of relIdsToDelete) deleteRelationshipInModel(model, rid);

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
}


export class ModelStore {
  private state: ModelStoreState = {
    model: null,
    fileName: null,
    isDirty: false
  };

  private listeners = new Set<Listener>();

  /**
   * IMPORTANT: All store methods are arrow functions to avoid `this`-binding bugs.
   *
   * Several UI layers pass store methods as callbacks. If these were prototype
   * methods (e.g. `updateRelationship() { ... }`), `this` could become undefined
   * or point at another object, causing runtime errors like:
   *   `TypeError: this.updateModel is not a function`
   */

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): ModelStoreState => {
    return this.state;
  };

  private setState = (next: Partial<ModelStoreState>): void => {
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) l();
  };

  private updateModel = (mutator: (model: Model) => void, markDirty = true): void => {
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
  };

  /** Replace the current model. */
  loadModel = (model: Model, fileName: string | null = null): void => {
    this.setState({ model, fileName, isDirty: false });
  };

  /**
   * Restore store state from persistence.
   *
   * This is intentionally separate from loadModel() so we can restore the
   * `isDirty` flag as well.
   */
  hydrate = (state: Pick<ModelStoreState, 'model' | 'fileName' | 'isDirty'>): void => {
    this.setState({
      model: state.model,
      fileName: state.fileName,
      isDirty: state.isDirty
    });
  };

  reset = (): void => {
    this.setState({ model: null, fileName: null, isDirty: false });
  };

  newModel = (metadata: ModelMetadata): void => {
    const model = createEmptyModel(metadata);
    this.setState({ model, fileName: null, isDirty: false });
  };

  /** Backwards-compatible alias used by tests/earlier steps. */
  createEmptyModel = (metadata: ModelMetadata): void => {
    this.newModel(metadata);
  };

  setFileName = (fileName: string | null): void => {
    this.setState({ fileName });
  };

  markSaved = (): void => {
    this.setState({ isDirty: false });
  };

  updateModelMetadata = (patch: Partial<ModelMetadata>): void => {
    this.updateModel((model) => {
      model.metadata = { ...model.metadata, ...patch };
    });
  };

  // -------------------------
  // Elements
  // -------------------------

  addElement = (element: Element, folderId?: string): void => {
    this.updateModel((model) => {
      model.elements[element.id] = element;

      const targetFolderId = folderId ?? findFolderIdByKind(model, 'root');
      const folder = getFolder(model, targetFolderId);
      if (!folder.elementIds.includes(element.id)) {
        model.folders[targetFolderId] = { ...folder, elementIds: [...folder.elementIds, element.id] };
      }
    });
  };

  updateElement = (elementId: string, patch: Partial<Omit<Element, 'id'>>): void => {
    this.updateModel((model) => {
      const current = model.elements[elementId];
      if (!current) throw new Error(`Element not found: ${elementId}`);
      const merged = { ...current, ...patch, id: current.id };
      model.elements[elementId] = sanitizeUnknownTypeForElement(merged);
    });
  };

  upsertElementTaggedValue = (elementId: string, entry: TaggedValueInput): void => {
    this.updateModel((model) => {
      const current = model.elements[elementId];
      if (!current) throw new Error(`Element not found: ${elementId}`);

      const withId: TaggedValue = {
        id: (entry.id && entry.id.trim()) ? entry.id : createId('tag'),
        ns: entry.ns,
        key: entry.key,
        type: entry.type,
        value: entry.value
      };

      const nextTaggedValues = upsertTaggedValue(current.taggedValues, withId);
      model.elements[elementId] = {
        ...current,
        taggedValues: nextTaggedValues.length ? nextTaggedValues : undefined
      };
    });
  };

  removeElementTaggedValue = (elementId: string, taggedValueId: string): void => {
    this.updateModel((model) => {
      const current = model.elements[elementId];
      if (!current) throw new Error(`Element not found: ${elementId}`);

      const nextTaggedValues = removeTaggedValue(current.taggedValues, taggedValueId);
      model.elements[elementId] = {
        ...current,
        taggedValues: nextTaggedValues.length ? nextTaggedValues : undefined
      };
    });
  };

  deleteElement = (elementId: string): void => {
    this.updateModel((model) => {
      deleteElementInModel(model, elementId);
    });
  };


  // -------------------------
  // Relationships
  // -------------------------

  addRelationship = (relationship: Relationship): void => {
    this.updateModel((model) => {
      model.relationships[relationship.id] = relationship;

      // Place the relationship in the same folder as the source element (fallback to root).
      const targetFolderId = findFolderContainingElement(model, relationship.sourceElementId) ?? findFolderIdByKind(model, 'root');
      const folder = getFolder(model, targetFolderId) as any;
      const relIds: string[] = Array.isArray(folder.relationshipIds) ? folder.relationshipIds : [];
      if (!relIds.includes(relationship.id)) {
        model.folders[targetFolderId] = { ...folder, relationshipIds: [...relIds, relationship.id] };
      }
    });
  };

  updateRelationship = (relationshipId: string, patch: Partial<Omit<Relationship, 'id'>>): void => {
    this.updateModel((model) => {
      const current = model.relationships[relationshipId];
      if (!current) throw new Error(`Relationship not found: ${relationshipId}`);
      const merged = { ...current, ...patch, id: current.id };
      merged.attrs = sanitizeRelationshipAttrs(merged.type, merged.attrs);
      model.relationships[relationshipId] = sanitizeUnknownTypeForRelationship(merged);
    });
  };

  upsertRelationshipTaggedValue = (relationshipId: string, entry: TaggedValueInput): void => {
    this.updateModel((model) => {
      const current = model.relationships[relationshipId];
      if (!current) throw new Error(`Relationship not found: ${relationshipId}`);

      const withId: TaggedValue = {
        id: (entry.id && entry.id.trim()) ? entry.id : createId('tag'),
        ns: entry.ns,
        key: entry.key,
        type: entry.type,
        value: entry.value
      };

      const nextTaggedValues = upsertTaggedValue(current.taggedValues, withId);
      model.relationships[relationshipId] = {
        ...current,
        taggedValues: nextTaggedValues.length ? nextTaggedValues : undefined
      };
    });
  };

  removeRelationshipTaggedValue = (relationshipId: string, taggedValueId: string): void => {
    this.updateModel((model) => {
      const current = model.relationships[relationshipId];
      if (!current) throw new Error(`Relationship not found: ${relationshipId}`);

      const nextTaggedValues = removeTaggedValue(current.taggedValues, taggedValueId);
      model.relationships[relationshipId] = {
        ...current,
        taggedValues: nextTaggedValues.length ? nextTaggedValues : undefined
      };
    });
  };

  deleteRelationship = (relationshipId: string): void => {
    this.updateModel((model) => {
      deleteRelationshipInModel(model, relationshipId);
    });
  };

  // -------------------------
  // Views
  // -------------------------
  addView = (view: View, folderId?: string): void => {
    this.updateModel((model) => {
      model.views[view.id] = view;

      // If the view is centered on an element, it should not live in any folder.
      if (view.centerElementId) {
        for (const fid of Object.keys(model.folders)) {
          const f = model.folders[fid];
          if (f.viewIds.includes(view.id)) {
            model.folders[fid] = { ...f, viewIds: f.viewIds.filter((id) => id !== view.id) };
          }
        }
        return;
      }

      const targetFolderId = folderId ?? findFolderIdByKind(model, 'root');
      const folder = getFolder(model, targetFolderId);
      if (!folder.viewIds.includes(view.id)) {
        model.folders[targetFolderId] = { ...folder, viewIds: [...folder.viewIds, view.id] };
      }
    });
  };
  updateView = (viewId: string, patch: Partial<Omit<View, 'id'>>): void => {
    this.updateModel((model) => {
      const current = model.views[viewId];
      if (!current) throw new Error(`View not found: ${viewId}`);

      const next: View = { ...current, ...patch, id: current.id };

      // Maintain placement invariant when centerElementId is modified.
      if (Object.prototype.hasOwnProperty.call(patch, 'centerElementId')) {
        const nextCenter = (patch as any).centerElementId as (string | undefined);

        if (typeof nextCenter === 'string' && nextCenter) {
          // Centered views should not be present in any folder list.
          for (const fid of Object.keys(model.folders)) {
            const f = model.folders[fid];
            if (f.viewIds.includes(viewId)) {
              model.folders[fid] = { ...f, viewIds: f.viewIds.filter((id) => id !== viewId) };
            }
          }
        } else if (!nextCenter) {
          // Clearing centering: ensure the view is in a folder (default to root).
          const inFolder = Object.values(model.folders).some((f) => f.viewIds.includes(viewId));
          if (!inFolder) {
            const rootId = findFolderIdByKind(model, 'root');
            const root = getFolder(model, rootId);
            model.folders[rootId] = root.viewIds.includes(viewId) ? root : { ...root, viewIds: [...root.viewIds, viewId] };
          }
        }
      }

      model.views[viewId] = next;
    });
  };

  upsertViewTaggedValue = (viewId: string, entry: TaggedValueInput): void => {
    this.updateModel((model) => {
      const current = model.views[viewId];
      if (!current) throw new Error(`View not found: ${viewId}`);

      const withId: TaggedValue = {
        id: (entry.id && entry.id.trim()) ? entry.id : createId('tag'),
        ns: entry.ns,
        key: entry.key,
        type: entry.type,
        value: entry.value
      };

      const nextTaggedValues = upsertTaggedValue(current.taggedValues, withId);
      model.views[viewId] = {
        ...current,
        taggedValues: nextTaggedValues.length ? nextTaggedValues : undefined
      };
    });
  };

  removeViewTaggedValue = (viewId: string, taggedValueId: string): void => {
    this.updateModel((model) => {
      const current = model.views[viewId];
      if (!current) throw new Error(`View not found: ${viewId}`);

      const nextTaggedValues = removeTaggedValue(current.taggedValues, taggedValueId);
      model.views[viewId] = {
        ...current,
        taggedValues: nextTaggedValues.length ? nextTaggedValues : undefined
      };
    });
  };

  updateViewFormatting = (viewId: string, patch: Partial<ViewFormatting>): void => {
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
  };

  /** Clone a view (including its layout) into the same folder as the original. Returns the new view id. */
  cloneView = (viewId: string): string | null => {
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
        centerElementId: original.centerElementId,
        layout: original.layout ? JSON.parse(JSON.stringify(original.layout)) : undefined
      });

      model.views[clone.id] = clone;

      // Preserve placement: if the original is centered on an element, keep the clone centered too.
      if (!original.centerElementId) {
        const folderId = findFolderContainingView(model, viewId) ?? findFolderIdByKind(model, 'root');
        model.folders[folderId] = {
          ...model.folders[folderId],
          viewIds: [...model.folders[folderId].viewIds, clone.id]
        };
      }

      created = clone.id;
    });

    return created;
  };

  updateViewNodeLayout = (viewId: string, elementId: string, patch: Partial<Omit<ViewNodeLayout, 'elementId'>>): void => {
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
  };

  deleteView = (viewId: string): void => {

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
  };

  // -------------------------
  // Diagram layout (per view)
  // -------------------------

  /** Adds an element to a view's layout as a positioned node (idempotent). */
  addElementToView = (viewId: string, elementId: string): string => {
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

      const maxZ = layout.nodes.reduce((m, n, idx) => Math.max(m, typeof n.zIndex === 'number' ? n.zIndex : idx), -1);
      const node: ViewNodeLayout = { elementId, x, y, width: 140, height: 70, zIndex: maxZ + 1 };
      model.views[viewId] = {
        ...viewWithLayout,
        layout: { nodes: [...layout.nodes, node], relationships: layout.relationships }
      };
    });

    return elementId;
  };

  /**
   * Adds an element to a view at a specific position (idempotent).
   * If the node already exists in the view, its position is updated.
   */
  addElementToViewAt = (viewId: string, elementId: string, x: number, y: number): string => {
    this.updateModel((model) => {
      const view = model.views[viewId];
      if (!view) throw new Error(`View not found: ${viewId}`);
      const element = model.elements[elementId];
      if (!element) throw new Error(`Element not found: ${elementId}`);

      const viewWithLayout = ensureViewLayout(view);
      const layout = viewWithLayout.layout!;

      const snap = Boolean(viewWithLayout.formatting?.snapToGrid);
      const grid = viewWithLayout.formatting?.gridSize ?? 20;

      const nodeW = 140;
      const nodeH = 70;
      // Drop position is interpreted as the cursor position; center the node under it.
      let nx = Math.max(0, x - nodeW / 2);
      let ny = Math.max(0, y - nodeH / 2);
      if (snap && grid > 1) {
        nx = Math.round(nx / grid) * grid;
        ny = Math.round(ny / grid) * grid;
      }

      const existing = layout.nodes.find((n) => n.elementId === elementId);
      if (existing) {
        const nextNodes = layout.nodes.map((n) => (n.elementId === elementId ? { ...n, x: nx, y: ny } : n));
        model.views[viewId] = { ...viewWithLayout, layout: { nodes: nextNodes, relationships: layout.relationships } };
        return;
      }

      const maxZ = layout.nodes.reduce((m, n, idx) => Math.max(m, typeof n.zIndex === 'number' ? n.zIndex : idx), -1);
      const node: ViewNodeLayout = { elementId, x: nx, y: ny, width: nodeW, height: nodeH, zIndex: maxZ + 1 };
      model.views[viewId] = {
        ...viewWithLayout,
        layout: { nodes: [...layout.nodes, node], relationships: layout.relationships },
      };
    });

    return elementId;
  };

  removeElementFromView = (viewId: string, elementId: string): void => {
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
  };

  updateViewNodePosition = (viewId: string, elementId: string, x: number, y: number): void => {
    this.updateModel((model) => {
      const view = getView(model, viewId);
      if (!view.layout) return;
      const layout = view.layout;
      const node = layout.nodes.find((n) => n.elementId === elementId);
      if (!node) return;
      const nextNodes = layout.nodes.map((n) => (n.elementId === elementId ? { ...n, x, y } : n));
      model.views[viewId] = { ...view, layout: { nodes: nextNodes, relationships: layout.relationships } };
    });
  };

  // -------------------------
  // Folders
  // -------------------------

  createFolder = (parentId: string, name: string): string => {
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
        relationshipIds: [],
        viewIds: []
      };
      model.folders = { ...model.folders, [folder.id]: folder };
      model.folders[parentId] = { ...parent, folderIds: [...parent.folderIds, folder.id] };
    });
    return id;
  };

  moveElementToFolder = (elementId: string, targetFolderId: string): void => {
    this.updateModel((model) => {
      const fromId = findFolderContainingElement(model, elementId);
      if (!fromId) throw new Error(`Element not found in any folder: ${elementId}`);
      if (fromId === targetFolderId) return;

      const from = getFolder(model, fromId);
      const to = getFolder(model, targetFolderId);

      model.folders[fromId] = { ...from, elementIds: from.elementIds.filter((id) => id !== elementId) };
      model.folders[targetFolderId] = { ...to, elementIds: [...to.elementIds, elementId] };
    });
  };
  moveViewToFolder = (viewId: string, targetFolderId: string): void => {
    this.updateModel((model) => {
      const view = getView(model, viewId);
      const fromId = findFolderContainingView(model, viewId);

      // If the view is currently centered on an element, it might not be in any folder.
      if (!fromId && !view.centerElementId) {
        throw new Error(`View not found in any folder: ${viewId}`);
      }

      // If already in the target folder and not centered, nothing to do.
      if (fromId === targetFolderId && !view.centerElementId) return;

      // Remove from the previous folder (if any).
      if (fromId) {
        const from = getFolder(model, fromId);
        model.folders[fromId] = { ...from, viewIds: from.viewIds.filter((id) => id !== viewId) };
      }

      // Clear centering when moving to a folder.
      if (view.centerElementId) {
        model.views[viewId] = { ...view, centerElementId: undefined };
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
    });
  };

  moveViewToElement = (viewId: string, elementId: string): void => {
    this.updateModel((model) => {
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
      model.views[viewId] = { ...view, centerElementId: elementId };
    });
  };

    renameFolder = (folderId: string, name: string): void => {
    this.updateModel((model) => {
      const folder = getFolder(model, folderId);
      if (folder.kind === 'root') {
        throw new Error('Cannot rename root folder');
      }
      model.folders[folderId] = { ...folder, name: name.trim() };
    });
  };

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
  deleteFolder = (
    folderId: string,
    options?: { mode?: 'move'; targetFolderId?: string } | { mode: 'deleteContents' }
  ): void => {
    this.updateModel((model) => {
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
          for (const rid of (f as any).relationshipIds ?? []) relationshipIds.add(rid);
          for (const vid of f.viewIds) viewIds.add(vid);
        }

        // Delete elements first (also deletes related relationships and removes from views).
        for (const eid of elementIds) deleteElementInModel(model, eid);

        // Delete relationships explicitly contained in the folder subtree (may include cross-folder relationships).
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
    });
  };

  /** Ensure a model has the root folder structure (used by future migrations). */
  ensureRootFolders = (): void => {
    this.updateModel(
      (model) => {
        // Will throw if missing, which is fine for now.
        findFolderIdByKind(model, 'root');
      },
      false
    );
  };
}

/** Factory used by tests and to create isolated store instances. */
export function createModelStore(): ModelStore {
  return new ModelStore();
}

/** App singleton store instance. */
export const modelStore = createModelStore();
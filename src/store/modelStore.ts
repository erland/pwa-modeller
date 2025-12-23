import { createEmptyModel as createEmptyDomainModel } from '../domain/factories';
import type { Element, Model, ModelMetadata, Relationship, View } from '../domain/types';

export interface ModelStoreState {
  model: Model | null;
}

export type Unsubscribe = () => void;

export interface ModelStore {
  getState(): ModelStoreState;
  subscribe(listener: () => void): Unsubscribe;

  // Model lifecycle
  createEmptyModel(metadata: ModelMetadata): void;
  updateModelMetadata(patch: Partial<ModelMetadata>): void;

  // Elements
  addElement(element: Element): void;
  updateElement(id: string, patch: Partial<Omit<Element, 'id'>>): void;
  deleteElement(id: string): void;

  // Relationships
  addRelationship(relationship: Relationship): void;
  updateRelationship(id: string, patch: Partial<Omit<Relationship, 'id'>>): void;
  deleteRelationship(id: string): void;

  // Views
  addView(view: View): void;
  updateView(id: string, patch: Partial<Omit<View, 'id'>>): void;
  deleteView(id: string): void;
}

function assertHasModel(model: Model | null): asserts model is Model {
  if (!model) throw new Error('No model loaded');
}

function findFolderIdByKind(model: Model, kind: 'elements' | 'views'): string | undefined {
  return Object.values(model.folders).find(f => f.kind === kind)?.id;
}

function removeFromAllFolderLists(model: Model, kind: 'elementIds' | 'viewIds', id: string): void {
  for (const folder of Object.values(model.folders)) {
    const idx = folder[kind].indexOf(id);
    if (idx >= 0) folder[kind].splice(idx, 1);
  }
}

function removeRelationshipsInViews(model: Model, relationshipIds: Set<string>): void {
  for (const view of Object.values(model.views)) {
    if (!view.layout?.relationships?.length) continue;
    view.layout.relationships = view.layout.relationships.filter(r => !relationshipIds.has(r.relationshipId));
  }
}

function removeElementInViews(model: Model, elementId: string): void {
  for (const view of Object.values(model.views)) {
    if (!view.layout?.nodes?.length) continue;
    view.layout.nodes = view.layout.nodes.filter(n => n.elementId !== elementId);
  }
}

export function createModelStore(initialState: ModelStoreState = { model: null }): ModelStore {
  let state: ModelStoreState = initialState;
  const listeners = new Set<() => void>();

  const cloneFolders = (folders: Model['folders']): Model['folders'] => {
    // structuredClone exists in modern browsers (and recent Node versions), but we keep a JSON fallback.
    // Folders are plain data objects so this is safe.
    return typeof structuredClone === 'function'
      ? structuredClone(folders)
      : (JSON.parse(JSON.stringify(folders)) as Model['folders']);
  };

  const notify = () => {
    for (const l of Array.from(listeners)) l();
  };

  const setState = (next: ModelStoreState) => {
    state = next;
    notify();
  };

  const updateModel = (updater: (model: Model) => void) => {
    const current = state.model;
    assertHasModel(current);
    // Mutate a shallow clone so react subscribers see a new reference.
    const nextModel: Model = {
      ...current,
      metadata: { ...current.metadata },
      elements: { ...current.elements },
      relationships: { ...current.relationships },
      views: { ...current.views },
      folders: cloneFolders(current.folders)
    };
    updater(nextModel);
    setState({ model: nextModel });
  };

  return {
    getState() {
      return state;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    createEmptyModel(metadata: ModelMetadata) {
      setState({ model: createEmptyDomainModel(metadata) });
    },

    updateModelMetadata(patch: Partial<ModelMetadata>) {
      updateModel(model => {
        model.metadata = { ...model.metadata, ...patch };
      });
    },

    addElement(element: Element) {
      updateModel(model => {
        if (model.elements[element.id]) throw new Error(`Element with id '${element.id}' already exists`);
        model.elements[element.id] = element;

        const elementsFolderId = findFolderIdByKind(model, 'elements');
        if (elementsFolderId) {
          model.folders[elementsFolderId].elementIds.push(element.id);
        }
      });
    },

    updateElement(id: string, patch: Partial<Omit<Element, 'id'>>) {
      updateModel(model => {
        const existing = model.elements[id];
        if (!existing) throw new Error(`Element '${id}' not found`);
        model.elements[id] = { ...existing, ...patch, id };
      });
    },

    deleteElement(id: string) {
      updateModel(model => {
        if (!model.elements[id]) return;
        delete model.elements[id];
        removeFromAllFolderLists(model, 'elementIds', id);
        removeElementInViews(model, id);

        // Remove relationships that reference this element.
        const deletedRelationshipIds = new Set<string>();
        for (const rel of Object.values(model.relationships)) {
          if (rel.sourceElementId === id || rel.targetElementId === id) {
            deletedRelationshipIds.add(rel.id);
          }
        }
        for (const relId of deletedRelationshipIds) {
          delete model.relationships[relId];
        }
        if (deletedRelationshipIds.size > 0) {
          removeRelationshipsInViews(model, deletedRelationshipIds);
        }
      });
    },

    addRelationship(relationship: Relationship) {
      updateModel(model => {
        if (model.relationships[relationship.id]) {
          throw new Error(`Relationship with id '${relationship.id}' already exists`);
        }
        if (!model.elements[relationship.sourceElementId]) {
          throw new Error(`Relationship source element '${relationship.sourceElementId}' not found`);
        }
        if (!model.elements[relationship.targetElementId]) {
          throw new Error(`Relationship target element '${relationship.targetElementId}' not found`);
        }
        model.relationships[relationship.id] = relationship;
      });
    },

    updateRelationship(id: string, patch: Partial<Omit<Relationship, 'id'>>) {
      updateModel(model => {
        const existing = model.relationships[id];
        if (!existing) throw new Error(`Relationship '${id}' not found`);
        const next = { ...existing, ...patch, id };
        if (!model.elements[next.sourceElementId]) {
          throw new Error(`Relationship source element '${next.sourceElementId}' not found`);
        }
        if (!model.elements[next.targetElementId]) {
          throw new Error(`Relationship target element '${next.targetElementId}' not found`);
        }
        model.relationships[id] = next;
      });
    },

    deleteRelationship(id: string) {
      updateModel(model => {
        if (!model.relationships[id]) return;
        delete model.relationships[id];
        removeRelationshipsInViews(model, new Set([id]));
      });
    },

    addView(view: View) {
      updateModel(model => {
        if (model.views[view.id]) throw new Error(`View with id '${view.id}' already exists`);
        model.views[view.id] = view;

        const viewsFolderId = findFolderIdByKind(model, 'views');
        if (viewsFolderId) {
          model.folders[viewsFolderId].viewIds.push(view.id);
        }
      });
    },

    updateView(id: string, patch: Partial<Omit<View, 'id'>>) {
      updateModel(model => {
        const existing = model.views[id];
        if (!existing) throw new Error(`View '${id}' not found`);
        model.views[id] = { ...existing, ...patch, id };
      });
    },

    deleteView(id: string) {
      updateModel(model => {
        if (!model.views[id]) return;
        delete model.views[id];
        removeFromAllFolderLists(model, 'viewIds', id);
      });
    }
  };
}

/** A default singleton store for the app UI. */
export const modelStore = createModelStore();

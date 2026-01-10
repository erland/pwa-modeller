import type {
  Element,
  Folder,
  Model,
  ModelMetadata,
  Relationship,
  RelationshipConnector,
  TaggedValue,
  View,
  ViewFormatting,
  ViewNodeLayout,
  ViewObject,
  ViewObjectType,
  RelationshipValidationMode
} from '../domain';
import { createEmptyModel } from '../domain';
import {
  connectorMutations,
  elementMutations,
  folderMutations,
  layoutMutations,
  modelMutations,
  relationshipMutations,
  viewMutations,
  viewObjectMutations
} from './mutations';
import type { TaggedValueInput } from './mutations';
import { findFolderIdByKind } from './mutations/helpers';

export type ModelStoreState = {
  model: Model | null;
  /** The last chosen file name (used as default for downloads). */
  fileName: string | null;
  /** Tracks if there are unsaved changes since last load/save. */
  isDirty: boolean;
  /** Relationship validation rule set used while drawing and in validation workspace. */
  relationshipValidationMode: RelationshipValidationMode;
};

type Listener = () => void;

export class ModelStore {
  private state: ModelStoreState = {
    model: null,
    fileName: null,
    isDirty: false,
    relationshipValidationMode: 'minimal'
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
      // Clone extension collections to avoid sharing references across state updates.
      externalIds: current.externalIds ? current.externalIds.map((r) => ({ ...r })) : undefined,
      taggedValues: current.taggedValues
        ? current.taggedValues.map((t) => {
            if (t.type === 'json' && t.value && typeof t.value === 'object') {
              // TaggedValue JSON values should be plain JSON; deep-clone defensively.
              return { ...t, value: JSON.parse(JSON.stringify(t.value)) };
            }
            return { ...t };
          })
        : undefined,
      metadata: { ...current.metadata },
      elements: { ...current.elements },
      relationships: { ...current.relationships },
      connectors: current.connectors ? { ...current.connectors } : undefined,
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
  hydrate = (
    state: Pick<ModelStoreState, 'model' | 'fileName' | 'isDirty' | 'relationshipValidationMode'>
  ): void => {
    this.setState({
      model: state.model,
      fileName: state.fileName,
      isDirty: state.isDirty,
      relationshipValidationMode: state.relationshipValidationMode ?? 'minimal'
    });
  };

  
  setRelationshipValidationMode = (mode: RelationshipValidationMode): void => {
    this.setState({ relationshipValidationMode: mode });
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
    this.updateModel((model) => modelMutations.updateModelMetadata(model, patch));
  };

  updateModelTaggedValues = (taggedValues: TaggedValue[] | undefined): void => {
    this.updateModel((model) => modelMutations.updateModelTaggedValues(model, taggedValues));
  };

  // -------------------------
  // Elements
  // -------------------------

  addElement = (element: Element, folderId?: string): void => {
    this.updateModel((model) => elementMutations.addElement(model, element, folderId));
  };

  updateElement = (elementId: string, patch: Partial<Omit<Element, 'id'>>): void => {
    this.updateModel((model) => elementMutations.updateElement(model, elementId, patch));
  };

  upsertElementTaggedValue = (elementId: string, entry: TaggedValueInput): void => {
    this.updateModel((model) => elementMutations.upsertElementTaggedValue(model, elementId, entry));
  };

  removeElementTaggedValue = (elementId: string, taggedValueId: string): void => {
    this.updateModel((model) => elementMutations.removeElementTaggedValue(model, elementId, taggedValueId));
  };

  deleteElement = (elementId: string): void => {
    this.updateModel((model) => elementMutations.deleteElement(model, elementId));
  };

  // -------------------------
  // Relationships
  // -------------------------

  addRelationship = (relationship: Relationship): void => {
    this.updateModel((model) => relationshipMutations.addRelationship(model, relationship));
  };

  updateRelationship = (relationshipId: string, patch: Partial<Omit<Relationship, 'id'>>): void => {
    this.updateModel((model) => relationshipMutations.updateRelationship(model, relationshipId, patch));
  };

  upsertRelationshipTaggedValue = (relationshipId: string, entry: TaggedValueInput): void => {
    this.updateModel((model) => relationshipMutations.upsertRelationshipTaggedValue(model, relationshipId, entry));
  };

  removeRelationshipTaggedValue = (relationshipId: string, taggedValueId: string): void => {
    this.updateModel((model) => relationshipMutations.removeRelationshipTaggedValue(model, relationshipId, taggedValueId));
  };

  deleteRelationship = (relationshipId: string): void => {
    this.updateModel((model) => relationshipMutations.deleteRelationship(model, relationshipId));
  };

  // -------------------------
  // Relationship connectors (junctions)
  // -------------------------

  addConnector = (connector: RelationshipConnector): void => {
    this.updateModel((model) => connectorMutations.addConnector(model, connector));
  };

  updateConnector = (connectorId: string, patch: Partial<Omit<RelationshipConnector, 'id'>>): void => {
    this.updateModel((model) => connectorMutations.updateConnector(model, connectorId, patch));
  };

  deleteConnector = (connectorId: string): void => {
    this.updateModel((model) => connectorMutations.deleteConnector(model, connectorId));
  };

  // -------------------------
  // Views
  // -------------------------

  addView = (view: View, folderId?: string): void => {
    this.updateModel((model) => viewMutations.addView(model, view, folderId));
  };

  updateView = (viewId: string, patch: Partial<Omit<View, 'id'>>): void => {
    this.updateModel((model) => viewMutations.updateView(model, viewId, patch));
  };

  upsertViewTaggedValue = (viewId: string, entry: TaggedValueInput): void => {
    this.updateModel((model) => viewMutations.upsertViewTaggedValue(model, viewId, entry));
  };

  removeViewTaggedValue = (viewId: string, taggedValueId: string): void => {
    this.updateModel((model) => viewMutations.removeViewTaggedValue(model, viewId, taggedValueId));
  };

  updateViewFormatting = (viewId: string, patch: Partial<ViewFormatting>): void => {
    this.updateModel((model) => viewMutations.updateViewFormatting(model, viewId, patch));
  };

  /** Clone a view (including its layout) into the same folder as the original. Returns the new view id. */
  cloneView = (viewId: string): string | null => {
    let created: string | null = null;
    this.updateModel((model) => {
      created = viewMutations.cloneView(model, viewId);
    });
    return created;
  };

  deleteView = (viewId: string): void => {
    this.updateModel((model) => viewMutations.deleteView(model, viewId));
  };

  // -------------------------
  // View-only (diagram) objects
  // -------------------------

  /** Add a view-local object to a view (and optionally a layout node). This does not touch the model element graph. */
  addViewObject = (viewId: string, obj: ViewObject, node?: ViewNodeLayout): void => {
    this.updateModel((model) => viewObjectMutations.addViewObject(model, viewId, obj, node));
  };

  /** Create a new view-local object and place it into the view at the given cursor position. Returns the object id. */
  createViewObjectInViewAt = (viewId: string, type: ViewObjectType, x: number, y: number): string => {
    let created = '';
    this.updateModel((model) => {
      created = viewObjectMutations.createViewObjectInViewAt(model, viewId, type, x, y);
    });
    return created;
  };

  updateViewObject = (viewId: string, objectId: string, patch: Partial<Omit<ViewObject, 'id'>>): void => {
    this.updateModel((model) => viewObjectMutations.updateViewObject(model, viewId, objectId, patch));
  };

  deleteViewObject = (viewId: string, objectId: string): void => {
    this.updateModel((model) => viewObjectMutations.deleteViewObject(model, viewId, objectId));
  };

  // -------------------------
  // Diagram layout (per view)
  // -------------------------

  updateViewNodeLayout = (viewId: string, elementId: string, patch: Partial<Omit<ViewNodeLayout, 'elementId'>>): void => {
    this.updateModel((model) => layoutMutations.updateViewNodeLayout(model, viewId, elementId, patch));
  };

  /** Adds an element to a view's layout as a positioned node (idempotent). */
  addElementToView = (viewId: string, elementId: string): string => {
    let result = elementId;
    this.updateModel((model) => {
      result = layoutMutations.addElementToView(model, viewId, elementId);
    });
    return result;
  };

  addElementToViewAt = (viewId: string, elementId: string, x: number, y: number): string => {
    let result = elementId;
    this.updateModel((model) => {
      result = layoutMutations.addElementToViewAt(model, viewId, elementId, x, y);
    });
    return result;
  };

  /** Adds a connector (junction) to a view at a specific position (idempotent). */
  addConnectorToViewAt = (viewId: string, connectorId: string, x: number, y: number): string => {
    let result = connectorId;
    this.updateModel((model) => {
      result = layoutMutations.addConnectorToViewAt(model, viewId, connectorId, x, y);
    });
    return result;
  };

  removeElementFromView = (viewId: string, elementId: string): void => {
    this.updateModel((model) => layoutMutations.removeElementFromView(model, viewId, elementId));
  };

  updateViewNodePosition = (viewId: string, elementId: string, x: number, y: number): void => {
    this.updateModel((model) => layoutMutations.updateViewNodePosition(model, viewId, elementId, x, y));
  };

  /** Updates position of an element-node, connector-node, or view-object node in a view. */
  updateViewNodePositionAny = (
    viewId: string,
    ref: { elementId?: string; connectorId?: string; objectId?: string },
    x: number,
    y: number
  ): void => {
    this.updateModel((model) => layoutMutations.updateViewNodePositionAny(model, viewId, ref, x, y));
  };

  /** Updates layout properties on an element-node, connector-node, or view-object node in a view. */
  updateViewNodeLayoutAny = (
    viewId: string,
    ref: { elementId?: string; connectorId?: string; objectId?: string },
    patch: Partial<Omit<ViewNodeLayout, 'elementId' | 'connectorId' | 'objectId'>>
  ): void => {
    this.updateModel((model) => layoutMutations.updateViewNodeLayoutAny(model, viewId, ref, patch));
  };

  // -------------------------
  // Folders
  // -------------------------

  createFolder = (parentId: string, name: string): string => {
    let created = '';
    this.updateModel((model) => {
      created = folderMutations.createFolder(model, parentId, name);
    });
    return created;
  };

  moveElementToFolder = (elementId: string, targetFolderId: string): void => {
    this.updateModel((model) => folderMutations.moveElementToFolder(model, elementId, targetFolderId));
  };

  moveViewToFolder = (viewId: string, targetFolderId: string): void => {
    this.updateModel((model) => folderMutations.moveViewToFolder(model, viewId, targetFolderId));
  };

  moveViewToElement = (viewId: string, elementId: string): void => {
    this.updateModel((model) => folderMutations.moveViewToElement(model, viewId, elementId));
  };

  moveFolderToFolder = (folderId: string, targetFolderId: string): void => {
    this.updateModel((model) => folderMutations.moveFolderToFolder(model, folderId, targetFolderId));
  };

  // -------------------------
  // Folder extensions (taggedValues/externalIds)
  // -------------------------

  updateFolder = (folderId: string, patch: Partial<Omit<Folder, 'id'>>): void => {
    this.updateModel((model) => folderMutations.updateFolder(model, folderId, patch));
  };

  renameFolder = (folderId: string, name: string): void => {
    this.updateModel((model) => folderMutations.renameFolder(model, folderId, name));
  };

  deleteFolder = (
    folderId: string,
    options?: { mode?: 'move'; targetFolderId?: string } | { mode: 'deleteContents' }
  ): void => {
    this.updateModel((model) => folderMutations.deleteFolder(model, folderId, options));
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

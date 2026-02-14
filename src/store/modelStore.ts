import type {
  Element,
  Folder,
  ModelKind,
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
  ViewConnectionRouteKind,
  ViewConnectionAnchorSide,
} from '../domain';
import type { AlignMode, AutoLayoutOptions, DistributeMode, SameSizeMode, LayoutOutput } from '../domain/layout/types';
import { createEmptyModel, createView, VIEWPOINTS } from '../domain';
import {
  connectorMutations,
  elementMutations,
  modelMutations,
  bpmnMutations,
  relationshipMutations,
  viewMutations,
  layoutMutations,
} from './mutations';
import type { TaggedValueInput } from './mutations';
import { createViewOps } from './ops/viewOps';
import { createLayoutOps } from './ops/layoutOps';
import { createFolderOps } from './ops/folderOps';
import { createElementOps } from './ops/elementOps';


export type ModelStoreState = {
  model: Model | null;
  /** The last chosen file name (used as default for downloads). */
  fileName: string | null;
  /** Tracks if there are unsaved changes since last load/save. */
  isDirty: boolean;
};

type Listener = () => void;

export class ModelStore {
  private state: ModelStoreState = {
    model: null,
    fileName: null,
    isDirty: false
  };

  private listeners = new Set<Listener>();

  // Cache last expensive auto-layout computation per view for responsiveness.
  private autoLayoutCacheByView = new Map<string, { signature: string; output: LayoutOutput }>();

  /**
   * IMPORTANT: All store methods are arrow functions to avoid `this`-binding bugs.
   *
   * Several UI layers pass store methods as callbacks. If these were prototype
   * methods (e.g. `updateRelationship() { … }`), `this` could become undefined
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

  // Operation modules (SoC split): keep ModelStore API stable, delegate implementation.
  private viewOps = createViewOps({ updateModel: this.updateModel });

  private layoutOps = createLayoutOps({
    getModel: () => this.state.model,
    getModelOrThrow: () => {
      const m = this.state.model;
      if (!m) throw new Error('No model loaded');
      return m;
    },
    updateModel: this.updateModel,
    autoLayoutCacheByView: this.autoLayoutCacheByView,
  });

  private folderOps = createFolderOps({ updateModel: this.updateModel });

  private elementOps = createElementOps({ updateModel: this.updateModel });

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
    state: Pick<ModelStoreState, 'model' | 'fileName' | 'isDirty'>
  ): void => {
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

  /**
   * Move element under another element (or null for root).
   * This updates Element.parentElementId (semantic containment), not folder membership.
   */
  moveElementToParent = (childId: string, parentId: string | null): void => {
    this.elementOps.moveElementToParent(childId, parentId);
  };

  /** Convenience alias: clears parentElementId. */
  detachElementToRoot = (childId: string): void => {
    this.elementOps.detachElementToRoot(childId);
  };

  // -------------------------
  // BPMN helpers (Level 2 semantics)
  // -------------------------

  /** Merge semantic attrs into an element (preserves unknown keys). */
  setBpmnElementAttrs = (elementId: string, patch: Record<string, unknown>): void => {
    this.updateModel((model) => bpmnMutations.setBpmnElementAttrs(model, elementId, patch));
  };

  /** Merge semantic attrs into a relationship (preserves unknown keys). */
  setBpmnRelationshipAttrs = (relationshipId: string, patch: Record<string, unknown>): void => {
    this.updateModel((model) => bpmnMutations.setBpmnRelationshipAttrs(model, relationshipId, patch));
  };

  /** Set a gateway default flow (null clears); also maintains outgoing sequenceFlow isDefault flags. */
  setBpmnGatewayDefaultFlow = (gatewayId: string, relationshipId: string | null): void => {
    this.updateModel((model) => bpmnMutations.setGatewayDefaultFlow(model, gatewayId, relationshipId));
  };

  /** Attach/detach a boundary event to a host activity (null detaches). */
  attachBoundaryEvent = (boundaryId: string, hostActivityId: string | null): void => {
    this.updateModel((model) => bpmnMutations.attachBoundaryEvent(model, boundaryId, hostActivityId));
  };

  /** Pool (Participant): set/clear its process reference. */
  setBpmnPoolProcessRef = (poolId: string, processId: string | null): void => {
    this.updateModel((model) => bpmnMutations.setPoolProcessRef(model, poolId, processId));
  };

  /** Lane: replace its semantic membership list (flowNodeRefs). */
  setBpmnLaneFlowNodeRefs = (laneId: string, nodeIds: string[]): void => {
    this.updateModel((model) => bpmnMutations.setLaneFlowNodeRefs(model, laneId, nodeIds));
  };

  /** Text annotation: set/clear its text. */
  setBpmnTextAnnotationText = (annotationId: string, text: string): void => {
    this.updateModel((model) => bpmnMutations.setTextAnnotationText(model, annotationId, text));
  };

  /** DataObjectReference: set/clear its referenced global DataObject. */
  setBpmnDataObjectReferenceRef = (refId: string, dataObjectId: string | null): void => {
    this.updateModel((model) => bpmnMutations.setDataObjectReferenceRef(model, refId, dataObjectId));
  };

  /** DataStoreReference: set/clear its referenced global DataStore. */
  setBpmnDataStoreReferenceRef = (refId: string, dataStoreId: string | null): void => {
    this.updateModel((model) => bpmnMutations.setDataStoreReferenceRef(model, refId, dataStoreId));
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

  addView = (view: View, folderId?: string): void => this.viewOps.addView(view, folderId);

  private collectElementIdsInFolder = (model: Model, folderId: string): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    const stack = [folderId];
    while (stack.length) {
      const fid = stack.pop()!;
      if (seen.has(fid)) continue;
      seen.add(fid);
      const f = model.folders[fid];
      if (!f) continue;
      for (const id of f.elementIds ?? []) out.push(id);
      for (const childId of f.folderIds ?? []) stack.push(childId);
    }
    return out;
  };

  private inferKindFromElementIds = (model: Model, elementIds: string[]): ModelKind => {
    // Heuristic:
    // - If all element types are qualified and share a prefix, pick that notation.
    // - Otherwise fall back to ArchiMate.
    const types = elementIds
      .map((id) => model.elements[id]?.type)
      .filter(Boolean)
      .map((t) => String(t));
    if (types.length === 0) return 'archimate';
    const qualified = types.filter((t) => t.includes('.'));
    if (qualified.length !== types.length) return 'archimate';
    const allUml = qualified.every((t) => t.startsWith('uml.'));
    if (allUml) return 'uml';
    const allBpmn = qualified.every((t) => t.startsWith('bpmn.'));
    if (allBpmn) return 'bpmn';
    return 'archimate';
  };

  private defaultViewpointForKind = (kind: ModelKind): string => {
    if (kind === 'uml') return VIEWPOINTS.find((v) => v.id === 'uml-class')?.id ?? 'uml-class';
    if (kind === 'bpmn') return VIEWPOINTS.find((v) => v.id === 'bpmn-process')?.id ?? 'bpmn-process';
    return VIEWPOINTS.find((v) => v.id === 'layered')?.id ?? 'layered';
  };

  private defaultAutoLayoutPresetForKind = (kind: ModelKind): AutoLayoutOptions['preset'] => {
    if (kind === 'archimate') return 'flow_bands';
    // BPMN/UML tend to look best with a simple layered flow.
    return 'flow';
  };

  /**
   * Create a new view containing all elements within a folder (including subfolders),
   * then run auto layout to produce a reasonable initial diagram.
   */
  createViewFromFolderElements = async (
    folderId: string,
    options: {
      name?: string;
      kind?: ModelKind;
      viewpointId?: string;
      /** Where to place the created view. Defaults to the "Views" root folder when invoked from an elements folder. */
      targetFolderId?: string;
      autoLayout?: boolean;
      autoLayoutPreset?: AutoLayoutOptions['preset'];
    } = {}
  ): Promise<string> => {
    const model = this.state.model;
    if (!model) throw new Error('No model loaded');
    const folder = model.folders[folderId];
    if (!folder) throw new Error(`Folder not found: ${folderId}`);

    const allElementIds = this.collectElementIdsInFolder(model, folderId);
    const kind = options.kind ?? this.inferKindFromElementIds(model, allElementIds);

    // Only include elements that match the view kind.
    const elementIds = allElementIds.filter((id) => {
      const t = String(model.elements[id]?.type ?? '');
      if (!t) return false;
      if (kind === 'archimate') return !t.includes('.');
      if (kind === 'uml') return t.startsWith('uml.');
      if (kind === 'bpmn') return t.startsWith('bpmn.');
      return true;
    });

    const baseName = (options.name ?? folder.name ?? 'Folder').trim() || 'Folder';
    const name = options.name?.trim() ? options.name.trim() : `View: ${baseName}`;
    const viewpointId = options.viewpointId ?? this.defaultViewpointForKind(kind);

    // Default placement: if invoked from a non-view folder (e.g. Elements), place the view under the "Views" root.
    const viewsRootId = Object.values(model.folders).find((f) => f.kind === 'views')?.id;
    const targetFolderId =
      options.targetFolderId ??
      (folder.kind === 'views' || folder.kind === 'custom' || folder.kind === 'root' ? folderId : (viewsRootId ?? folderId));

    const created = createView({ name, kind, viewpointId });

    this.updateModel((m) => {
      viewMutations.addView(m, created, targetFolderId);
      // Place all elements as nodes (fast bulk add) so auto layout has something to work with.
      layoutMutations.addElementsToView(m, created.id, elementIds);
    });

    const doLayout = options.autoLayout ?? true;
    if (doLayout) {
      const preset = options.autoLayoutPreset ?? this.defaultAutoLayoutPresetForKind(kind);
      await this.autoLayoutView(created.id, { preset });
    }

    return created.id;
  };

  
  /**
   * Add multiple elements (typically selected in the model navigator) to an existing view.
   * By default, triggers auto layout afterwards to make the diagram reasonable.
   */
  addElementsToViewFromNavigator = async (
    viewId: string,
    elementIds: string[],
    options: { autoLayout?: boolean; preset?: AutoLayoutOptions['preset'] } = {}
  ): Promise<void> => {
    const model = this.state.model;
    if (!model) throw new Error('No model loaded');
    const view = model.views[viewId];
    if (!view) throw new Error(`View not found: ${viewId}`);

    const kind = view.kind as ModelKind;

    const filtered = (elementIds ?? []).filter((id) => {
      const t = String(model.elements[id]?.type ?? '');
      if (!t) return false;
      if (kind === 'archimate') return !t.includes('.');
      if (kind === 'uml') return t.startsWith('uml.');
      if (kind === 'bpmn') return t.startsWith('bpmn.');
      return true;
    });

    if (!filtered.length) return;

    this.updateModel((m) => {
      layoutMutations.addElementsToView(m, viewId, filtered);
    });

    // Ensure any newly-visible relationships/connectors are recomputed.
    this.ensureViewConnections(viewId);

    const doLayout = options.autoLayout ?? true;
    if (doLayout) {
      const preset = options.preset ?? this.defaultAutoLayoutPresetForKind(kind);
      await this.autoLayoutView(viewId, { preset }, filtered);
    }
  };

updateView = (viewId: string, patch: Partial<Omit<View, 'id'>>): void => this.viewOps.updateView(viewId, patch);

  ensureViewConnections = (viewId: string): void => this.viewOps.ensureViewConnections(viewId);

  /**
   * If the target view uses explicit relationship visibility, include the given relationship id.
   * This is used to keep "explicit" views usable when creating relationships interactively.
   */
  includeRelationshipInView = (viewId: string, relationshipId: string): void => this.viewOps.includeRelationshipInView(viewId, relationshipId);

  /**
   * Hide a specific relationship in a view.
   *
   * If the view currently uses implicit relationship visibility, it will be
   * converted to explicit mode using the view's *current* visible relationships
   * as the starting allow-list.
   */
  hideRelationshipInView = (viewId: string, relationshipId: string): void => this.viewOps.hideRelationshipInView(viewId, relationshipId);

  /**
   * Show (include) a specific relationship in a view that uses explicit visibility.
   *
   * If the view currently uses implicit relationship visibility, it will be
   * converted to explicit mode using the view's *current* visible relationships
   * as the starting allow-list.
   */
  showRelationshipInView = (viewId: string, relationshipId: string): void => this.viewOps.showRelationshipInView(viewId, relationshipId);

  setViewConnectionRoute = (viewId: string, connectionId: string, kind: ViewConnectionRouteKind): void => this.viewOps.setViewConnectionRoute(viewId, connectionId, kind);

  setViewConnectionEndpointAnchors = (
    viewId: string,
    connectionId: string,
    patch: { sourceAnchor?: ViewConnectionAnchorSide; targetAnchor?: ViewConnectionAnchorSide }
  ): void => this.viewOps.setViewConnectionEndpointAnchors(viewId, connectionId, patch);

  upsertViewTaggedValue = (viewId: string, entry: TaggedValueInput): void => this.viewOps.upsertViewTaggedValue(viewId, entry);

  removeViewTaggedValue = (viewId: string, taggedValueId: string): void => this.viewOps.removeViewTaggedValue(viewId, taggedValueId);

  updateViewFormatting = (viewId: string, patch: Partial<ViewFormatting>): void => this.viewOps.updateViewFormatting(viewId, patch);

  /** Clone a view (including its layout) into the same folder as the original. Returns the new view id. */
  cloneView = (viewId: string): string | null => this.viewOps.cloneView(viewId);

  deleteView = (viewId: string): void => this.viewOps.deleteView(viewId);

  // -------------------------
  // View-only (diagram) objects
  // -------------------------

  /** Add a view-local object to a view (and optionally a layout node). This does not touch the model element graph. */
  addViewObject = (viewId: string, obj: ViewObject, node?: ViewNodeLayout): void => this.viewOps.addViewObject(viewId, obj, node);

  /** Create a new view-local object and place it into the view at the given cursor position. Returns the object id. */
  createViewObjectInViewAt = (viewId: string, type: ViewObjectType, x: number, y: number): string => this.viewOps.createViewObjectInViewAt(viewId, type, x, y);

  updateViewObject = (viewId: string, objectId: string, patch: Partial<Omit<ViewObject, 'id'>>): void => this.viewOps.updateViewObject(viewId, objectId, patch);

  deleteViewObject = (viewId: string, objectId: string): void => this.viewOps.deleteViewObject(viewId, objectId);

  // -------------------------
  // Diagram layout (per view)
  // -------------------------

  updateViewNodeLayout = (viewId: string, elementId: string, patch: Partial<Omit<ViewNodeLayout, 'elementId'>>): void => this.viewOps.updateViewNodeLayout(viewId, elementId, patch);

  /** Adds an element to a view's layout as a positioned node (idempotent). */
  addElementToView = (viewId: string, elementId: string): string => this.viewOps.addElementToView(viewId, elementId);

  addElementToViewAt = (viewId: string, elementId: string, x: number, y: number): string => this.layoutOps.addElementToViewAt(viewId, elementId, x, y);

  /** Adds a connector (junction) to a view at a specific position (idempotent). */
  addConnectorToViewAt = (viewId: string, connectorId: string, x: number, y: number): string => this.layoutOps.addConnectorToViewAt(viewId, connectorId, x, y);

  removeElementFromView = (viewId: string, elementId: string): void => this.layoutOps.removeElementFromView(viewId, elementId);

  updateViewNodePosition = (viewId: string, elementId: string, x: number, y: number): void => this.layoutOps.updateViewNodePosition(viewId, elementId, x, y);

  /** Updates position of an element-node, connector-node, or view-object node in a view. */
  updateViewNodePositionAny = (
    viewId: string,
    ref: { elementId?: string; connectorId?: string; objectId?: string },
    x: number,
    y: number
  ): void => this.layoutOps.updateViewNodePositionAny(viewId, ref, x, y);

  /**
   * Batch position update for multiple nodes (element/connector/object) in a view.
   *
   * This is primarily used for multi-select dragging, to avoid triggering a store update per node.
   */
  updateViewNodePositionsAny = (
    viewId: string,
    updates: Array<{ ref: { elementId?: string; connectorId?: string; objectId?: string }; x: number; y: number }>
  ): void => this.layoutOps.updateViewNodePositionsAny(viewId, updates);

  /** Updates layout properties on an element-node, connector-node, or view-object node in a view. */
  updateViewNodeLayoutAny = (
    viewId: string,
    ref: { elementId?: string; connectorId?: string; objectId?: string },
    patch: Partial<Omit<ViewNodeLayout, 'elementId' | 'connectorId' | 'objectId'>>
  ): void => this.layoutOps.updateViewNodeLayoutAny(viewId, ref, patch);

  /** Align element nodes in a view based on the current selection. */
  alignViewElements = (viewId: string, elementIds: string[], mode: AlignMode): void => this.layoutOps.alignViewElements(viewId, elementIds, mode);

  /** Distribute selected element nodes evenly within a view. */
  distributeViewElements = (viewId: string, elementIds: string[], mode: DistributeMode): void => this.layoutOps.distributeViewElements(viewId, elementIds, mode);

  /** Make selected element nodes the same size within a view. */
  sameSizeViewElements = (viewId: string, elementIds: string[], mode: SameSizeMode): void => this.layoutOps.sameSizeViewElements(viewId, elementIds, mode);

  /**
   * Resize selected ArchiMate element boxes so their visible text fits.
   *
   * Only applies to element-backed nodes in the given view.
   */
  fitViewElementsToText = (viewId: string, elementIds: string[]): void => this.layoutOps.fitViewElementsToText(viewId, elementIds);

  autoLayoutView = (viewId: string, options: AutoLayoutOptions = {}, selectionNodeIds?: string[]): Promise<void> => this.layoutOps.autoLayoutView(viewId, options, selectionNodeIds);


  // -------------------------
  // Folders
  // -------------------------

  createFolder = (parentId: string, name: string): string => this.folderOps.createFolder(parentId, name);

  moveElementToFolder = (elementId: string, targetFolderId: string): void => this.folderOps.moveElementToFolder(elementId, targetFolderId);

  moveViewToFolder = (viewId: string, targetFolderId: string): void => this.folderOps.moveViewToFolder(viewId, targetFolderId);

  moveViewToElement = (viewId: string, elementId: string): void => this.folderOps.moveViewToElement(viewId, elementId);

  moveFolderToFolder = (folderId: string, targetFolderId: string): void => this.folderOps.moveFolderToFolder(folderId, targetFolderId);

  // -------------------------
  // Folder extensions (taggedValues/externalIds)
  // -------------------------

  updateFolder = (folderId: string, patch: Partial<Omit<Folder, 'id'>>): void => this.folderOps.updateFolder(folderId, patch);

  renameFolder = (folderId: string, name: string): void => this.folderOps.renameFolder(folderId, name);

  deleteFolder = (
    folderId: string,
    options?: { mode?: 'move'; targetFolderId?: string } | { mode: 'deleteContents' }
  ): void => this.folderOps.deleteFolder(folderId, options);

  /** Ensure a model has the root folder structure (used by future migrations). */
  ensureRootFolders = (): void => this.folderOps.ensureRootFolders();
}

/** Factory used by tests and to create isolated store instances. */
export function createModelStore(): ModelStore {
  return new ModelStore();
}

/** App singleton store instance. */
export const modelStore = createModelStore();

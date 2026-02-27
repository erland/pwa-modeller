import type {
  Folder,
  ModelKind,
  Model,
  View,
  ViewFormatting,
  ViewNodeLayout,
  ViewObject,
  ViewObjectType,
  ViewConnectionRouteKind,
  ViewConnectionAnchorSide,
} from '../domain';
import type { AlignMode, AutoLayoutOptions, DistributeMode, SameSizeMode } from '../domain/layout/types';
import { createView, VIEWPOINTS } from '../domain';
import { viewMutations, layoutMutations } from './mutations';
import type { TaggedValueInput } from './mutations/helpers';

import type { ChangeSet } from './changeSet';

import { DEFAULT_LOCAL_DATASET_ID } from './datasetTypes';
import type { ModelStoreState, StoreListener } from './modelStoreTypes';
import { ModelStoreCore } from './modelStoreCore';
import { ModelStoreFlush, type FlushListener } from './modelStoreFlush';
import { createModelStoreOpsFacade } from './modelStoreOpsFacade';
import { createModelStoreEntityApi } from './modelStoreEntityApi';

// Re-export for backwards compatibility (many imports use `./modelStore`).
export type { ModelStoreState } from './modelStoreTypes';

export class ModelStore {
  private flush = new ModelStoreFlush();
  private core = new ModelStoreCore(
    {
      activeDatasetId: DEFAULT_LOCAL_DATASET_ID,
      model: null,
      fileName: null,
      isDirty: false,
      persistenceStatus: { status: 'ok', message: null, lastOkAt: 0, lastErrorAt: null },
      persistenceConflict: null,
      persistenceValidationFailure: null,
      persistenceLeaseConflict: null,
      persistenceRemoteChanged: null
    },
    (state) => this.flush.onNotify(state),
  );

  private ops = createModelStoreOpsFacade({
    getModel: this.core.getModel,
    getModelOrThrow: this.core.getModelOrThrow,
    updateModel: this.core.updateModel,
    recordTouched: (touched) => this.flush.changeSetRecorder.recordTouched(touched),
  });

  // Entity-level API (extracted module)
  private entityApi = createModelStoreEntityApi({
    setState: this.core.setState,
    updateModel: this.core.updateModel,
    changeSetRecorder: this.flush.changeSetRecorder,
  });

  // ------------------
  // Store Core API
  // ------------------

  getState = (): ModelStoreState => this.core.getState();

  // -------------------------
  // Persistence status (user-scoped runtime)
  // -------------------------
  setPersistenceOk = (now: number = Date.now()): void => {
    const cur = this.core.getState().persistenceStatus;
    if (cur.status === 'ok' && cur.message === null) {
      // Already ok; just refresh timestamp if it changed.
      if (cur.lastOkAt === now) return;
    }
    this.setState({
      ...this.core.getState(),
      persistenceStatus: {
        status: 'ok',
        message: null,
        lastOkAt: now,
        lastErrorAt: cur.status === 'error' ? cur.lastErrorAt : cur.lastErrorAt
      }
    });
  };

  subscribe = (listener: StoreListener): (() => void) => this.core.subscribe(listener);

  subscribeFlush = (listener: FlushListener): (() => void) => this.flush.subscribeFlush(listener);

  setPersistenceError = (message: string, now: number = Date.now()): void => {
    const cur = this.core.getState().persistenceStatus;
    if (cur.status === 'error' && cur.message === message) return;
    this.setState({
      ...this.core.getState(),
      persistenceStatus: {
        status: 'error',
        message,
        lastOkAt: cur.status === 'ok' ? cur.lastOkAt : cur.lastOkAt,
        lastErrorAt: now
      }
    });
  };

  setPersistenceConflict = (
    conflict: {
      datasetId: string;
      message: string;
      detectedAt?: number;
      serverEtag?: string | null;
      serverRevision?: number | null;
      serverUpdatedAt?: string | null;
      serverUpdatedBy?: string | null;
      serverSavedAt?: string | null;
      serverSavedBy?: string | null;
    },
    now: number = Date.now(),
  ): void => {
    const cur = this.core.getState().persistenceConflict;
    const detectedAt = conflict.detectedAt ?? now;
    const next = {
      datasetId: conflict.datasetId as any,
      message: conflict.message,
      detectedAt,
      serverEtag: conflict.serverEtag ?? null,
      serverRevision: conflict.serverRevision ?? null,
      serverUpdatedAt: conflict.serverUpdatedAt ?? null,
      serverUpdatedBy: conflict.serverUpdatedBy ?? null,
      serverSavedAt: conflict.serverSavedAt ?? null,
      serverSavedBy: conflict.serverSavedBy ?? null
    };

    // Avoid noisy state churn for repeated flush errors.
    if (
      cur &&
      cur.datasetId === next.datasetId &&
      cur.message === next.message &&
      cur.serverEtag === next.serverEtag &&
      (cur.serverRevision ?? null) === (next.serverRevision ?? null) &&
      (cur.serverUpdatedAt ?? null) === (next.serverUpdatedAt ?? null) &&
      (cur.serverUpdatedBy ?? null) === (next.serverUpdatedBy ?? null) &&
      (cur.serverSavedAt ?? null) === (next.serverSavedAt ?? null) &&
      (cur.serverSavedBy ?? null) === (next.serverSavedBy ?? null)
    ) {
      return;
    }

    this.setState({
      ...this.core.getState(),
      persistenceConflict: next
    });

    // Also surface in the generic status chip.
    this.setPersistenceError(conflict.message, now);
  };

  clearPersistenceConflict = (): void => {
    const cur = this.core.getState().persistenceConflict;
    if (!cur) return;
    this.setState({
      ...this.core.getState(),
      persistenceConflict: null,
      persistenceValidationFailure: null
    });
  };

  // -------------------------
  // Validation failure (Phase 2)
  // -------------------------
  setPersistenceValidationFailure = (
    failure: {
      datasetId: string;
      message: string;
      detectedAt?: number;
      validationErrors?: Array<{ path: string; message: string; rule?: string | null; severity?: string | null }>;
    },
    now: number = Date.now(),
  ): void => {
    const detectedAt = failure.detectedAt ?? now;
    this.setState({
      ...this.core.getState(),
      persistenceValidationFailure: {
        datasetId: failure.datasetId as any,
        message: failure.message,
        detectedAt,
        validationErrors: failure.validationErrors ?? []
      }
    });

    // Also surface in the generic status chip.
    this.setPersistenceError(failure.message, now);
  };

  clearPersistenceValidationFailure = (): void => {
    const cur = this.core.getState().persistenceValidationFailure;
    if (!cur) return;
    this.setState({
      ...this.core.getState(),
      persistenceValidationFailure: null
    });
  };


  // -------------------------
  // Lease conflict (Phase 2)
  // -------------------------
  setPersistenceLeaseConflict = (
    conflict: {
      datasetId: string;
      message: string;
      detectedAt?: number;
      holderSub?: string | null;
      expiresAt?: string | null;
      myRole?: 'OWNER' | 'EDITOR' | 'VIEWER' | null;
      serverEtag?: string | null;
    },
    now: number = Date.now(),
  ): void => {
    const detectedAt = conflict.detectedAt ?? now;
    this.setState({
      ...this.core.getState(),
      persistenceLeaseConflict: {
        datasetId: conflict.datasetId as any,
        message: conflict.message,
        detectedAt,
        holderSub: conflict.holderSub ?? null,
        expiresAt: conflict.expiresAt ?? null,
        myRole: conflict.myRole ?? null,
        serverEtag: conflict.serverEtag ?? null
      }
    });

    // Also surface in the generic status chip.
    this.setPersistenceError(conflict.message, now);
  };

  clearPersistenceLeaseConflict = (): void => {
    const cur = this.core.getState().persistenceLeaseConflict;
    if (!cur) return;
    this.setState({
      ...this.core.getState(),
      persistenceLeaseConflict: null,
      persistenceRemoteChanged: null
    });
  };


setPersistenceRemoteChanged = (change: import('./modelStoreTypes').RemoteHeadChanged): void => {
  const now = Date.now();
  this.setState({
    ...this.core.getState(),
    persistenceRemoteChanged: {
      ...change,
      detectedAt: change.detectedAt ?? now
    }
  });
};

clearPersistenceRemoteChanged = (): void => {
  const cur = this.core.getState().persistenceRemoteChanged;
  if (!cur) return;
  this.setState({
    ...this.core.getState(),
    persistenceRemoteChanged: null
  });
};



  /**
   * Internal: consume the last flushed ChangeSet (captured since the previous
   * store notification).
   */
  consumeLastChangeSet = (): ChangeSet | null => this.flush.consumeLastChangeSet();

  private setState = (next: Partial<ModelStoreState>): void => this.core.setState(next);

  /** Begin a transaction. Subscribers are notified only when the outermost transaction ends. */
  beginTransaction = (): void => this.core.beginTransaction();

  /** End a transaction started by beginTransaction(). */
  endTransaction = (): void => this.core.endTransaction();

  /** Convenience helper that ensures transactions are correctly closed. */
  runInTransaction = <T>(fn: () => T): T => {
    this.beginTransaction();
    try {
      return fn();
    } finally {
      this.endTransaction();
    }
  };

  /** Internal helper to run async ops within a transaction boundary. */
  private runInTransactionAsync = async <T>(fn: () => Promise<T>): Promise<T> => {
    this.beginTransaction();
    try {
      return await fn();
    } finally {
      this.endTransaction();
    }
  };

  private updateModel = (mutator: (model: Model) => void, markDirty = true): void => this.core.updateModel(mutator, markDirty);

  moveElementToParent = (childId: string, parentId: string | null): void => {
    this.runInTransaction(() => this.ops.elementOps.moveElementToParent(childId, parentId));
  };

  detachElementToRoot = (childId: string): void => {
    this.runInTransaction(() => this.ops.elementOps.detachElementToRoot(childId));
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
    state: Pick<ModelStoreState, 'model' | 'fileName' | 'isDirty'> &
      Partial<Pick<ModelStoreState, 'activeDatasetId'>>
  ): void => {
    this.setState({
      activeDatasetId: state.activeDatasetId ?? this.core.getState().activeDatasetId,
      model: state.model,
      fileName: state.fileName,
      isDirty: state.isDirty
    });
  };

  reset = (): void => {
    // Keep activeDatasetId stable; reset only clears the in-memory model.
    this.setState({ model: null, fileName: null, isDirty: false });
  };

  // -------------------------
  // Model / metadata / entities (delegated)
  // -------------------------

  newModel = this.entityApi.newModel;
  createEmptyModel = this.entityApi.createEmptyModel;
  setFileName = this.entityApi.setFileName;
  markSaved = this.entityApi.markSaved;
  updateModelMetadata = this.entityApi.updateModelMetadata;
  updateModelTaggedValues = this.entityApi.updateModelTaggedValues;

  addElement = this.entityApi.addElement;
  updateElement = this.entityApi.updateElement;
  upsertElementTaggedValue = this.entityApi.upsertElementTaggedValue;
  removeElementTaggedValue = this.entityApi.removeElementTaggedValue;
  deleteElement = this.entityApi.deleteElement;

  setBpmnElementAttrs = this.entityApi.setBpmnElementAttrs;
  setBpmnRelationshipAttrs = this.entityApi.setBpmnRelationshipAttrs;
  setBpmnGatewayDefaultFlow = this.entityApi.setBpmnGatewayDefaultFlow;
  attachBoundaryEvent = this.entityApi.attachBoundaryEvent;
  setBpmnPoolProcessRef = this.entityApi.setBpmnPoolProcessRef;
  setBpmnLaneFlowNodeRefs = this.entityApi.setBpmnLaneFlowNodeRefs;
  setBpmnTextAnnotationText = this.entityApi.setBpmnTextAnnotationText;
  setBpmnDataObjectReferenceRef = this.entityApi.setBpmnDataObjectReferenceRef;
  setBpmnDataStoreReferenceRef = this.entityApi.setBpmnDataStoreReferenceRef;

  addRelationship = this.entityApi.addRelationship;
  updateRelationship = this.entityApi.updateRelationship;
  upsertRelationshipTaggedValue = this.entityApi.upsertRelationshipTaggedValue;
  removeRelationshipTaggedValue = this.entityApi.removeRelationshipTaggedValue;
  deleteRelationship = this.entityApi.deleteRelationship;

  addConnector = this.entityApi.addConnector;
  updateConnector = this.entityApi.updateConnector;
  deleteConnector = this.entityApi.deleteConnector;

  // -------------------------
  // Views
  // -------------------------

  addView = (view: View, folderId?: string): void => {
    this.runInTransaction(() => this.ops.viewOps.addView(view, folderId));
  };

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
    const model = this.core.getState().model;
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
    const model = this.core.getState().model;
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

  updateView = (viewId: string, patch: Partial<Omit<View, 'id'>>): void => {
    this.runInTransaction(() => this.ops.viewOps.updateView(viewId, patch));
  };

  ensureViewConnections = (viewId: string): void => {
    this.runInTransaction(() => this.ops.viewOps.ensureViewConnections(viewId));
  };

  /**
   * If the target view uses explicit relationship visibility, include the given relationship id.
   * This is used to keep "explicit" views usable when creating relationships interactively.
   */
  includeRelationshipInView = (viewId: string, relationshipId: string): void => {
    this.runInTransaction(() => this.ops.viewOps.includeRelationshipInView(viewId, relationshipId));
  };

  /**
   * Hide a specific relationship in a view.
   *
   * If the view currently uses implicit relationship visibility, it will be
   * converted to explicit mode using the view's *current* visible relationships
   * as the starting allow-list.
   */
  hideRelationshipInView = (viewId: string, relationshipId: string): void => {
    this.runInTransaction(() => this.ops.viewOps.hideRelationshipInView(viewId, relationshipId));
  };

  /**
   * Show (include) a specific relationship in a view that uses explicit visibility.
   *
   * If the view currently uses implicit relationship visibility, it will be
   * converted to explicit mode using the view's *current* visible relationships
   * as the starting allow-list.
   */
  showRelationshipInView = (viewId: string, relationshipId: string): void => {
    this.runInTransaction(() => this.ops.viewOps.showRelationshipInView(viewId, relationshipId));
  };

  setViewConnectionRoute = (viewId: string, connectionId: string, kind: ViewConnectionRouteKind): void => {
    this.runInTransaction(() => this.ops.viewOps.setViewConnectionRoute(viewId, connectionId, kind));
  };

  setViewConnectionEndpointAnchors = (
    viewId: string,
    connectionId: string,
    patch: { sourceAnchor?: ViewConnectionAnchorSide; targetAnchor?: ViewConnectionAnchorSide }
  ): void => {
    this.runInTransaction(() => this.ops.viewOps.setViewConnectionEndpointAnchors(viewId, connectionId, patch));
  };

  upsertViewTaggedValue = (viewId: string, entry: TaggedValueInput): void => {
    this.runInTransaction(() => this.ops.viewOps.upsertViewTaggedValue(viewId, entry));
  };

  removeViewTaggedValue = (viewId: string, taggedValueId: string): void => {
    this.runInTransaction(() => this.ops.viewOps.removeViewTaggedValue(viewId, taggedValueId));
  };

  updateViewFormatting = (viewId: string, patch: Partial<ViewFormatting>): void => {
    this.runInTransaction(() => this.ops.viewOps.updateViewFormatting(viewId, patch));
  };

  /** Clone a view (including its layout) into the same folder as the original. Returns the new view id. */
  cloneView = (viewId: string): string | null => this.runInTransaction(() => this.ops.viewOps.cloneView(viewId));

  deleteView = (viewId: string): void => {
    this.runInTransaction(() => this.ops.viewOps.deleteView(viewId));
  };

  // -------------------------
  // View-only (diagram) objects
  // -------------------------

  /** Add a view-local object to a view (and optionally a layout node). This does not touch the model element graph. */
  addViewObject = (viewId: string, obj: ViewObject, node?: ViewNodeLayout): void => {
    this.runInTransaction(() => this.ops.viewOps.addViewObject(viewId, obj, node));
  };

  /** Create a new view-local object and place it into the view at the given cursor position. Returns the object id. */
  createViewObjectInViewAt = (viewId: string, type: ViewObjectType, x: number, y: number): string =>
    this.runInTransaction(() => this.ops.viewOps.createViewObjectInViewAt(viewId, type, x, y));

  updateViewObject = (viewId: string, objectId: string, patch: Partial<Omit<ViewObject, 'id'>>): void => {
    this.runInTransaction(() => this.ops.viewOps.updateViewObject(viewId, objectId, patch));
  };

  deleteViewObject = (viewId: string, objectId: string): void => {
    this.runInTransaction(() => this.ops.viewOps.deleteViewObject(viewId, objectId));
  };

  // -------------------------
  // Diagram layout (per view)
  // -------------------------

  updateViewNodeLayout = (viewId: string, elementId: string, patch: Partial<Omit<ViewNodeLayout, 'elementId'>>): void => {
    this.runInTransaction(() => this.ops.viewOps.updateViewNodeLayout(viewId, elementId, patch));
  };

  /** Adds an element to a view's layout as a positioned node (idempotent). */
  addElementToView = (viewId: string, elementId: string): string => this.runInTransaction(() => this.ops.viewOps.addElementToView(viewId, elementId));

  addElementToViewAt = (viewId: string, elementId: string, x: number, y: number): string =>
    this.runInTransaction(() => this.ops.layoutOps.addElementToViewAt(viewId, elementId, x, y));

  /** Adds a connector (junction) to a view at a specific position (idempotent). */
  addConnectorToViewAt = (viewId: string, connectorId: string, x: number, y: number): string =>
    this.runInTransaction(() => this.ops.layoutOps.addConnectorToViewAt(viewId, connectorId, x, y));

  removeElementFromView = (viewId: string, elementId: string): void => {
    this.runInTransaction(() => this.ops.layoutOps.removeElementFromView(viewId, elementId));
  };

  updateViewNodePosition = (viewId: string, elementId: string, x: number, y: number): void => {
    this.runInTransaction(() => this.ops.layoutOps.updateViewNodePosition(viewId, elementId, x, y));
  };

  /** Updates position of an element-node, connector-node, or view-object node in a view. */
  updateViewNodePositionAny = (
    viewId: string,
    ref: { elementId?: string; connectorId?: string; objectId?: string },
    x: number,
    y: number
  ): void => {
    this.runInTransaction(() => this.ops.layoutOps.updateViewNodePositionAny(viewId, ref, x, y));
  };

  /**
   * Batch position update for multiple nodes (element/connector/object) in a view.
   *
   * This is primarily used for multi-select dragging, to avoid triggering a store update per node.
   */
  updateViewNodePositionsAny = (
    viewId: string,
    updates: Array<{ ref: { elementId?: string; connectorId?: string; objectId?: string }; x: number; y: number }>
  ): void => {
    this.runInTransaction(() => this.ops.layoutOps.updateViewNodePositionsAny(viewId, updates));
  };

  /** Updates layout properties on an element-node, connector-node, or view-object node in a view. */
  updateViewNodeLayoutAny = (
    viewId: string,
    ref: { elementId?: string; connectorId?: string; objectId?: string },
    patch: Partial<Omit<ViewNodeLayout, 'elementId' | 'connectorId' | 'objectId'>>
  ): void => {
    this.runInTransaction(() => this.ops.layoutOps.updateViewNodeLayoutAny(viewId, ref, patch));
  };

  /** Align element nodes in a view based on the current selection. */
  alignViewElements = (viewId: string, elementIds: string[], mode: AlignMode): void => {
    this.runInTransaction(() => this.ops.layoutOps.alignViewElements(viewId, elementIds, mode));
  };

  /** Distribute selected element nodes evenly within a view. */
  distributeViewElements = (viewId: string, elementIds: string[], mode: DistributeMode): void => {
    this.runInTransaction(() => this.ops.layoutOps.distributeViewElements(viewId, elementIds, mode));
  };

  /** Make selected element nodes the same size within a view. */
  sameSizeViewElements = (viewId: string, elementIds: string[], mode: SameSizeMode): void => {
    this.runInTransaction(() => this.ops.layoutOps.sameSizeViewElements(viewId, elementIds, mode));
  };

  /**
   * Resize selected ArchiMate element boxes so their visible text fits.
   *
   * Only applies to element-backed nodes in the given view.
   */
  fitViewElementsToText = (viewId: string, elementIds: string[]): void => {
    this.runInTransaction(() => this.ops.layoutOps.fitViewElementsToText(viewId, elementIds));
  };

  autoLayoutView = (viewId: string, options: AutoLayoutOptions = {}, selectionNodeIds?: string[]): Promise<void> =>
    this.runInTransactionAsync(() => this.ops.layoutOps.autoLayoutView(viewId, options, selectionNodeIds));


  // -------------------------
  // Folders
  // -------------------------

  createFolder = (parentId: string, name: string): string => this.runInTransaction(() => this.ops.folderOps.createFolder(parentId, name));

  moveElementToFolder = (elementId: string, targetFolderId: string): void => {
    this.runInTransaction(() => this.ops.folderOps.moveElementToFolder(elementId, targetFolderId));
  };

  moveViewToFolder = (viewId: string, targetFolderId: string): void => {
    this.runInTransaction(() => this.ops.folderOps.moveViewToFolder(viewId, targetFolderId));
  };

  moveViewToElement = (viewId: string, elementId: string): void => {
    this.runInTransaction(() => this.ops.folderOps.moveViewToElement(viewId, elementId));
  };

  moveFolderToFolder = (folderId: string, targetFolderId: string): void => {
    this.runInTransaction(() => this.ops.folderOps.moveFolderToFolder(folderId, targetFolderId));
  };

  // -------------------------
  // Folder extensions (taggedValues/externalIds)
  // -------------------------

  updateFolder = (folderId: string, patch: Partial<Omit<Folder, 'id'>>): void => {
    this.runInTransaction(() => this.ops.folderOps.updateFolder(folderId, patch));
  };

  renameFolder = (folderId: string, name: string): void => {
    this.runInTransaction(() => this.ops.folderOps.renameFolder(folderId, name));
  };

  deleteFolder = (
    folderId: string,
    options?: { mode?: 'move'; targetFolderId?: string } | { mode: 'deleteContents' }
  ): void => {
    this.runInTransaction(() => this.ops.folderOps.deleteFolder(folderId, options));
  };

  /** Ensure a model has the root folder structure (used by future migrations). */
  ensureRootFolders = (): void => {
    this.runInTransaction(() => this.ops.folderOps.ensureRootFolders());
  };
}

/** Factory used by tests and to create isolated store instances. */
export function createModelStore(): ModelStore {
  return new ModelStore();
}

/** App singleton store instance. */
export const modelStore = createModelStore();
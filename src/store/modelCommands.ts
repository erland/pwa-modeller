import type {
  Folder,
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
import type { TaggedValueInput } from './mutations/helpers';

import type { ChangeSet } from './changeSet';
import type { ModelStoreState, StoreListener } from './modelStoreTypes';
import { ModelStoreFlush, type FlushListener } from './modelStoreFlush';

import { createModelStoreWiring, type ModelStoreWiring } from './modelStoreWiring';

import { createEntityCommands } from './modelCommands/entityCommands';
import { createDatasetCommands } from './modelCommands/datasetCommands';
import { maybeUpdateRemotePendingSnapshotReplace } from './modelCommands/remoteCommands';
import { createViewCommands } from './modelCommands/viewCommands';

// Re-export for backwards compatibility (many imports use `./modelStore`).
export type { ModelStoreState } from './modelStoreTypes';

export class ModelStore {
  private wiring: ModelStoreWiring;
  private flush: ModelStoreFlush;
  private core: ModelStoreWiring['core'];
  private ops: ModelStoreWiring['ops'];
  private entityApi: ModelStoreWiring['entityApi'];

  // -------------------------
  // Commands (delegated by concern)
  // -------------------------
  public newModel!: (...args: Parameters<ModelStoreWiring['entityApi']['newModel']>) => ReturnType<ModelStoreWiring['entityApi']['newModel']>;
  public createEmptyModel!: (...args: Parameters<ModelStoreWiring['entityApi']['createEmptyModel']>) => ReturnType<ModelStoreWiring['entityApi']['createEmptyModel']>;
  public setFileName!: (...args: Parameters<ModelStoreWiring['entityApi']['setFileName']>) => ReturnType<ModelStoreWiring['entityApi']['setFileName']>;
  public markSaved!: (...args: Parameters<ModelStoreWiring['entityApi']['markSaved']>) => ReturnType<ModelStoreWiring['entityApi']['markSaved']>;
  public updateModelMetadata!: (...args: Parameters<ModelStoreWiring['entityApi']['updateModelMetadata']>) => ReturnType<ModelStoreWiring['entityApi']['updateModelMetadata']>;
  public updateModelTaggedValues!: (...args: Parameters<ModelStoreWiring['entityApi']['updateModelTaggedValues']>) => ReturnType<ModelStoreWiring['entityApi']['updateModelTaggedValues']>;
  public addElement!: (...args: Parameters<ModelStoreWiring['entityApi']['addElement']>) => ReturnType<ModelStoreWiring['entityApi']['addElement']>;
  public updateElement!: (...args: Parameters<ModelStoreWiring['entityApi']['updateElement']>) => ReturnType<ModelStoreWiring['entityApi']['updateElement']>;
  public upsertElementTaggedValue!: (...args: Parameters<ModelStoreWiring['entityApi']['upsertElementTaggedValue']>) => ReturnType<ModelStoreWiring['entityApi']['upsertElementTaggedValue']>;
  public removeElementTaggedValue!: (...args: Parameters<ModelStoreWiring['entityApi']['removeElementTaggedValue']>) => ReturnType<ModelStoreWiring['entityApi']['removeElementTaggedValue']>;
  public deleteElement!: (...args: Parameters<ModelStoreWiring['entityApi']['deleteElement']>) => ReturnType<ModelStoreWiring['entityApi']['deleteElement']>;
  public setBpmnElementAttrs!: (...args: Parameters<ModelStoreWiring['entityApi']['setBpmnElementAttrs']>) => ReturnType<ModelStoreWiring['entityApi']['setBpmnElementAttrs']>;
  public setBpmnRelationshipAttrs!: (...args: Parameters<ModelStoreWiring['entityApi']['setBpmnRelationshipAttrs']>) => ReturnType<ModelStoreWiring['entityApi']['setBpmnRelationshipAttrs']>;
  public setBpmnGatewayDefaultFlow!: (...args: Parameters<ModelStoreWiring['entityApi']['setBpmnGatewayDefaultFlow']>) => ReturnType<ModelStoreWiring['entityApi']['setBpmnGatewayDefaultFlow']>;
  public attachBoundaryEvent!: (...args: Parameters<ModelStoreWiring['entityApi']['attachBoundaryEvent']>) => ReturnType<ModelStoreWiring['entityApi']['attachBoundaryEvent']>;
  public setBpmnPoolProcessRef!: (...args: Parameters<ModelStoreWiring['entityApi']['setBpmnPoolProcessRef']>) => ReturnType<ModelStoreWiring['entityApi']['setBpmnPoolProcessRef']>;
  public setBpmnLaneFlowNodeRefs!: (...args: Parameters<ModelStoreWiring['entityApi']['setBpmnLaneFlowNodeRefs']>) => ReturnType<ModelStoreWiring['entityApi']['setBpmnLaneFlowNodeRefs']>;
  public setBpmnTextAnnotationText!: (...args: Parameters<ModelStoreWiring['entityApi']['setBpmnTextAnnotationText']>) => ReturnType<ModelStoreWiring['entityApi']['setBpmnTextAnnotationText']>;
  public setBpmnDataObjectReferenceRef!: (...args: Parameters<ModelStoreWiring['entityApi']['setBpmnDataObjectReferenceRef']>) => ReturnType<ModelStoreWiring['entityApi']['setBpmnDataObjectReferenceRef']>;
  public setBpmnDataStoreReferenceRef!: (...args: Parameters<ModelStoreWiring['entityApi']['setBpmnDataStoreReferenceRef']>) => ReturnType<ModelStoreWiring['entityApi']['setBpmnDataStoreReferenceRef']>;
  public addRelationship!: (...args: Parameters<ModelStoreWiring['entityApi']['addRelationship']>) => ReturnType<ModelStoreWiring['entityApi']['addRelationship']>;
  public updateRelationship!: (...args: Parameters<ModelStoreWiring['entityApi']['updateRelationship']>) => ReturnType<ModelStoreWiring['entityApi']['updateRelationship']>;
  public upsertRelationshipTaggedValue!: (...args: Parameters<ModelStoreWiring['entityApi']['upsertRelationshipTaggedValue']>) => ReturnType<ModelStoreWiring['entityApi']['upsertRelationshipTaggedValue']>;
  public removeRelationshipTaggedValue!: (...args: Parameters<ModelStoreWiring['entityApi']['removeRelationshipTaggedValue']>) => ReturnType<ModelStoreWiring['entityApi']['removeRelationshipTaggedValue']>;
  public deleteRelationship!: (...args: Parameters<ModelStoreWiring['entityApi']['deleteRelationship']>) => ReturnType<ModelStoreWiring['entityApi']['deleteRelationship']>;
  public addConnector!: (...args: Parameters<ModelStoreWiring['entityApi']['addConnector']>) => ReturnType<ModelStoreWiring['entityApi']['addConnector']>;
  public updateConnector!: (...args: Parameters<ModelStoreWiring['entityApi']['updateConnector']>) => ReturnType<ModelStoreWiring['entityApi']['updateConnector']>;
  public deleteConnector!: (...args: Parameters<ModelStoreWiring['entityApi']['deleteConnector']>) => ReturnType<ModelStoreWiring['entityApi']['deleteConnector']>;

  public addView!: (view: View, folderId?: string) => void;
  public updateView!: (viewId: string, patch: Partial<Omit<View, 'id'>>) => void;
  public ensureViewConnections!: (viewId: string) => void;
  public includeRelationshipInView!: (viewId: string, relationshipId: string) => void;
  public hideRelationshipInView!: (viewId: string, relationshipId: string) => void;
  public showRelationshipInView!: (viewId: string, relationshipId: string) => void;
  public setViewConnectionRoute!: (viewId: string, connectionId: string, kind: ViewConnectionRouteKind) => void;
  public setViewConnectionEndpointAnchors!: (viewId: string, connectionId: string, patch: { sourceAnchor?: ViewConnectionAnchorSide; targetAnchor?: ViewConnectionAnchorSide }) => void;
  public upsertViewTaggedValue!: (viewId: string, entry: TaggedValueInput) => void;
  public removeViewTaggedValue!: (viewId: string, taggedValueId: string) => void;
  public updateViewFormatting!: (viewId: string, patch: Partial<ViewFormatting>) => void;
  public cloneView!: (viewId: string) => string | null;
  public createViewFromFolderElements!: (folderId: string, options?: { name?: string; kind?: import('../domain').ModelKind; viewpointId?: string; targetFolderId?: string; autoLayout?: boolean; autoLayoutPreset?: AutoLayoutOptions['preset'] }) => Promise<string>;
  public addElementsToViewFromNavigator!: (viewId: string, elementIds: string[], options?: { autoLayout?: boolean; preset?: AutoLayoutOptions['preset'] }) => Promise<void>;
  public deleteView!: (viewId: string) => void;
  public addViewObject!: (viewId: string, obj: ViewObject, node?: ViewNodeLayout) => void;
  public createViewObjectInViewAt!: (viewId: string, type: ViewObjectType, x: number, y: number) => string;
  public updateViewObject!: (viewId: string, objectId: string, patch: Partial<Omit<ViewObject, 'id'>>) => void;
  public deleteViewObject!: (viewId: string, objectId: string) => void;
  public updateViewNodeLayout!: (viewId: string, elementId: string, patch: Partial<Omit<ViewNodeLayout, 'elementId'>>) => void;
  public addElementToView!: (viewId: string, elementId: string) => string;
  public addElementToViewAt!: (viewId: string, elementId: string, x: number, y: number) => string;
  public addConnectorToViewAt!: (viewId: string, connectorId: string, x: number, y: number) => string;
  public removeElementFromView!: (viewId: string, elementId: string) => void;
  public updateViewNodePosition!: (viewId: string, elementId: string, x: number, y: number) => void;
  public updateViewNodePositionAny!: (viewId: string, ref: { elementId?: string; connectorId?: string; objectId?: string }, x: number, y: number) => void;
  public updateViewNodePositionsAny!: (viewId: string, updates: Array<{ ref: { elementId?: string; connectorId?: string; objectId?: string }; x: number; y: number }>) => void;
  public updateViewNodeLayoutAny!: (viewId: string, ref: { elementId?: string; connectorId?: string; objectId?: string }, patch: Partial<Omit<ViewNodeLayout, 'elementId' | 'connectorId' | 'objectId'>>) => void;
  public alignViewElements!: (viewId: string, elementIds: string[], mode: AlignMode) => void;
  public distributeViewElements!: (viewId: string, elementIds: string[], mode: DistributeMode) => void;
  public sameSizeViewElements!: (viewId: string, elementIds: string[], mode: SameSizeMode) => void;
  public fitViewElementsToText!: (viewId: string, elementIds: string[]) => void;
  public autoLayoutView!: (viewId: string, options?: AutoLayoutOptions, selectionNodeIds?: string[]) => Promise<void>;
  public createFolder!: (parentId: string, name: string) => string;
  public moveElementToFolder!: (elementId: string, targetFolderId: string) => void;
  public moveViewToFolder!: (viewId: string, targetFolderId: string) => void;
  public moveViewToElement!: (viewId: string, elementId: string) => void;
  public moveFolderToFolder!: (folderId: string, targetFolderId: string) => void;
  public updateFolder!: (folderId: string, patch: Partial<Omit<Folder, 'id'>>) => void;
  public renameFolder!: (folderId: string, name: string) => void;
  public deleteFolder!: (folderId: string, options?: { mode?: 'move'; targetFolderId?: string } | { mode: 'deleteContents' }) => void;
  public ensureRootFolders!: () => void;


  constructor() {
    this.wiring = createModelStoreWiring({
      updateModel: (mutator, markDirty) => this.updateModel(mutator, markDirty),
    });
    this.flush = this.wiring.flush;
    this.core = this.wiring.core;
    this.ops = this.wiring.ops;
    this.entityApi = this.wiring.entityApi;
    // Bind command groups (split by concern) to keep this file small and maintain a stable public API surface.
    Object.assign(this, createEntityCommands(this.entityApi));
    Object.assign(
      this,
      createViewCommands({
        ops: this.ops,
        getState: () => this.core.getState(),
        setState: (next) => this.setState(next),
        updateModel: (mutator, markDirty) => this.updateModel(mutator, markDirty),
        runInTransaction: (fn) => this.runInTransaction(fn),
        runInTransactionAsync: (fn) => this.runInTransactionAsync(fn)
      })
    );

    Object.assign(
      this,
      createDatasetCommands({
        ops: this.ops,
        runInTransaction: (fn) => this.runInTransaction(fn),
      })
    );
  }

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

  /**
   * Central model update hook.
   *
   * Phase 3 (Step 6): when Phase 3 ops are enabled for a remote dataset,
   * route local edits into the pending-ops pipeline.
   */
  private updateModel = (mutator: (model: Model) => void, markDirty = true): void => {
    this.core.updateModel(mutator, markDirty);
    if (!markDirty) return;

    const st = this.core.getState();
    if (!st.model) return;
    maybeUpdateRemotePendingSnapshotReplace(st);
  };

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

}
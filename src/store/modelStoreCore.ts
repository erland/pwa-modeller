import type { Model } from '../domain';
import type { ModelStoreState, StoreListener } from './modelStoreTypes';

/**
 * Core store mechanics: state container, subscribe, transactions/batching,
 * and model-level helpers (getModel/updateModel).
 *
 * This module is intentionally storage/backend-agnostic.
 */
export class ModelStoreCore {
  private state: ModelStoreState;
  private listeners = new Set<StoreListener>();
  private transactionDepth = 0;
  private pendingNotify = false;

  constructor(
    initialState: ModelStoreState,
    private readonly notifyHook: (state: ModelStoreState) => void,
  ) {
    this.state = initialState;
  }

  getState = (): ModelStoreState => this.state;

  subscribe = (listener: StoreListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  beginTransaction = (): void => {
    this.transactionDepth += 1;
  };

  endTransaction = (): void => {
    if (this.transactionDepth <= 0) return;
    this.transactionDepth -= 1;
    if (this.transactionDepth === 0 && this.pendingNotify) {
      this.pendingNotify = false;
      this.notify();
    }
  };

  runInTransaction = (fn: () => void): void => {
    this.beginTransaction();
    try {
      fn();
    } finally {
      this.endTransaction();
    }
  };

  setState = (next: Partial<ModelStoreState>): void => {
    this.state = { ...this.state, ...next };
    if (this.transactionDepth > 0) {
      this.pendingNotify = true;
      return;
    }
    this.notify();
  };

  hydrate = (next: Partial<ModelStoreState>): void => {
    // Hydrate is treated as a single transaction so subscribers see one update.
    this.runInTransaction(() => this.setState(next));
  };

  getModel = (): Model | null => this.state.model;

  getModelOrThrow = (): Model => {
    const model = this.state.model;
    if (!model) throw new Error('Model is not loaded');
    return model;
  };

  updateModel = (mutator: (model: Model) => void, markDirty = true): void => {
    const current = this.state.model;
    if (!current) throw new Error('Model is not loaded');

    // Clone the model maps to keep update semantics consistent with prior store behavior
    // (treat model as structurally immutable at the top level).
    const nextModel: Model = {
      ...current,
      metadata: { ...current.metadata },
      // Ensure model-level arrays are cloned so callers can rely on referential change
      // even when arrays are empty (important for deterministic store semantics and tests).
      externalIds: [...(current.externalIds ?? [])],
      taggedValues: [...(current.taggedValues ?? [])],
      elements: { ...current.elements },
      relationships: { ...current.relationships },
      connectors: current.connectors ? { ...current.connectors } : undefined,
      views: { ...current.views },
      folders: { ...current.folders },
    };

    mutator(nextModel);
    this.setState({ model: nextModel, isDirty: markDirty ? true : this.state.isDirty });
  };

  private notify(): void {
    this.notifyHook(this.state);
    for (const listener of this.listeners) listener();
  }
}

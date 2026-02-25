import type { ModelStoreState } from './modelStoreTypes';
import { emptyChangeSet } from './changeSet';
import type { ChangeSet } from './changeSet';
import { ChangeSetRecorder } from './changeSetRecorder';
import type { StoreFlushEvent } from './storeFlushEvent';

export type FlushListener = (event: StoreFlushEvent) => void;

/**
 * Flush pipeline: ChangeSet flush + StoreFlushEvent emission.
 * Triggered by ModelStoreCore.notifyHook().
 */
export class ModelStoreFlush {
  readonly changeSetRecorder = new ChangeSetRecorder();

  private flushListeners = new Set<FlushListener>();
  private lastNotifiedChangeSet: ChangeSet | null = null;

  subscribeFlush = (listener: FlushListener): (() => void) => {
    this.flushListeners.add(listener);
    return () => this.flushListeners.delete(listener);
  };

  consumeLastChangeSet = (): ChangeSet | null => {
    const cs = this.lastNotifiedChangeSet;
    this.lastNotifiedChangeSet = null;
    return cs;
  };

  /** Called exactly once per store notification boundary. */
  onNotify = (state: ModelStoreState): void => {
    const flushed = this.changeSetRecorder.flush();
    this.lastNotifiedChangeSet = flushed;

    const event: StoreFlushEvent = {
      datasetId: state.activeDatasetId,
      persisted: { model: state.model, fileName: state.fileName, isDirty: state.isDirty },
      changeSet: flushed ?? emptyChangeSet(),
      timestamp: Date.now(),
    };

    for (const l of this.flushListeners) l(event);
  };
}

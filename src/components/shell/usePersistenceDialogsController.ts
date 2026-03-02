import { useState } from 'react';

import { computeModelSignature } from '../../domain';
import {
  downloadTextFile,
  loadOverlayExportMarker,
  modelStore,
  sanitizeFileName,
  useModelStore,
  useOverlayStore
} from '../../store';
import { openDataset, retryAcquireLeaseForDataset } from '../../store/datasetLifecycle';
import { RemoteDatasetBackend } from '../../store/backends/remoteDatasetBackend';
import { flushStorePersistence, flushStorePersistenceForce, setStorePersistencePaused } from '../../store/initStorePersistence';
import { setLeaseConflict, setLeaseExpiresAt, setLeaseToken } from '../../store/remoteDatasetSession';

export function usePersistenceDialogsController() {
  const persistenceStatus = useModelStore((s) => s.persistenceStatus);
  const persistenceConflict = useModelStore((s) => s.persistenceConflict);
  const persistenceValidationFailure = useModelStore((s) => s.persistenceValidationFailure);
  const persistenceLeaseConflict = useModelStore((s) => s.persistenceLeaseConflict);
  const persistenceRemoteChanged = useModelStore((s) => s.persistenceRemoteChanged);
  const { isDirty, model, activeDatasetId } = useModelStore((s) => ({
    isDirty: s.isDirty,
    model: s.model,
    activeDatasetId: s.activeDatasetId
  }));

  const { overlayCount, overlayVersion } = useOverlayStore((s) => ({
    overlayCount: s.size,
    overlayVersion: s.getVersion()
  }));

  const [isRemoteOpsDiagOpen, setIsRemoteOpsDiagOpen] = useState(false);

  const overlaySignature = model ? computeModelSignature(model) : '';
  const overlayExportMarker = overlaySignature ? loadOverlayExportMarker(overlaySignature) : null;
  const overlayExportDirty = overlayCount > 0 && (!overlayExportMarker || overlayExportMarker.version !== overlayVersion);

  const onExportLocalValidationSnapshot = () => {
    const st = modelStore.getState();
    const file = sanitizeFileName(`validation-failed-${st.activeDatasetId}`);
    const json = JSON.stringify(st.model ?? null, null, 2);
    downloadTextFile(file, json, 'application/json');
  };

  const onKeepPausedAfterValidation = () => {
    modelStore.clearPersistenceValidationFailure();
    modelStore.setPersistenceError('Remote validation unresolved. Auto-save paused for this session.');
  };

  const onResumeAfterValidation = () => {
    modelStore.clearPersistenceValidationFailure();
    modelStore.setPersistenceOk();
    setStorePersistencePaused(false);
    flushStorePersistence();
  };

  const onExportLocalConflictSnapshot = () => {
    const st = modelStore.getState();
    const file = sanitizeFileName(`conflict-${st.activeDatasetId}`);
    const json = JSON.stringify(st.model ?? null, null, 2);
    downloadTextFile(file, json, 'application/json');
  };

  const onKeepLocalChangesAfterConflict = () => {
    // Keep auto-save paused for this session. User can re-enable by reloading from server later.
    modelStore.clearPersistenceConflict();
    modelStore.setPersistenceError('Remote conflict unresolved. Auto-save paused for this session.');
  };

  const onReloadFromServerAfterConflict = () => {
    const st = modelStore.getState();
    const datasetId = st.activeDatasetId;
    // Reload the dataset from the remote server, discarding local changes.
    const backend = new RemoteDatasetBackend();
    setStorePersistencePaused(true);
    void openDataset(datasetId, backend)
      .then(() => {
        modelStore.clearPersistenceConflict();
        modelStore.setPersistenceOk();
        setStorePersistencePaused(false);
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        modelStore.setPersistenceError(msg);
      });
  };

  const onReloadFromServerAfterRemoteChanged = () => {
    const st = modelStore.getState();
    const datasetId = st.activeDatasetId;
    const backend = new RemoteDatasetBackend();
    setStorePersistencePaused(true);
    void openDataset(datasetId, backend)
      .then(() => {
        modelStore.clearPersistenceRemoteChanged();
        modelStore.setPersistenceOk();
        setStorePersistencePaused(false);
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        modelStore.setPersistenceError(msg);
      });
  };

  const onKeepLocalChangesAfterRemoteChanged = () => {
    modelStore.clearPersistenceRemoteChanged();
  };

  const onOpenReadOnlyAfterLeaseConflict = () => {
    const conflict = modelStore.getState().persistenceLeaseConflict;
    if (!conflict) return;
    // Keep persistence paused and clear lease information so we stop attempting remote writes.
    setStorePersistencePaused(true);
    setLeaseToken(conflict.datasetId, null);
    setLeaseExpiresAt(conflict.datasetId, null);
    setLeaseConflict(conflict.datasetId, null);
    modelStore.clearPersistenceLeaseConflict();
    modelStore.setPersistenceError('Remote dataset is locked by another user. Opened in read-only mode; auto-save paused.');
  };

  const onRetryLeaseAfterConflict = async () => {
    const conflict = modelStore.getState().persistenceLeaseConflict;
    if (!conflict) return;
    try {
      await retryAcquireLeaseForDataset(conflict.datasetId);
      modelStore.clearPersistenceLeaseConflict();
      modelStore.setPersistenceOk();
      setStorePersistencePaused(false);
      flushStorePersistence();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      modelStore.setPersistenceError(msg);
    }
  };

  const onForceSaveAfterLeaseConflict = () => {
    // One-shot force persist retry; only shown for OWNER (server-enforced).
    modelStore.clearPersistenceLeaseConflict();
    setStorePersistencePaused(false);
    flushStorePersistenceForce();
  };

  return {
    // store-derived state
    persistenceStatus,
    persistenceConflict,
    persistenceValidationFailure,
    persistenceLeaseConflict,
    persistenceRemoteChanged,
    isDirty,
    model,
    activeDatasetId,

    // overlay status
    overlayCount,
    overlayExportMarker,
    overlayExportDirty,

    // diagnostics dialog
    isRemoteOpsDiagOpen,
    setIsRemoteOpsDiagOpen,

    // handlers
    onExportLocalValidationSnapshot,
    onKeepPausedAfterValidation,
    onResumeAfterValidation,
    onExportLocalConflictSnapshot,
    onKeepLocalChangesAfterConflict,
    onReloadFromServerAfterConflict,
    onReloadFromServerAfterRemoteChanged,
    onKeepLocalChangesAfterRemoteChanged,
    onOpenReadOnlyAfterLeaseConflict,
    onRetryLeaseAfterConflict,
    onForceSaveAfterLeaseConflict
  };
}

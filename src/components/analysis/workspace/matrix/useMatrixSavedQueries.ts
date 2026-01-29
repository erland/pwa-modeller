import { useCallback, useMemo } from 'react';

import type { RelationshipMatrixResult } from '../../../../domain/analysis/relationshipMatrix';
import type { MatrixQueryPreset } from '../../matrixPresetsStorage';

import { mapAnalysisDirectionToMatrixDirection } from './queryHelpers';
import type { MatrixWorkspaceBuiltQuery } from './types';
import { useMatrixPresets } from './useMatrixPresets';

export type UseMatrixSavedQueriesArgs = {
  modelId: string;
  uiQuery: MatrixQueryPreset['query'];
  axesRowIds: string[];
  axesColIds: string[];
  builtQuery: MatrixWorkspaceBuiltQuery | null;
  result: RelationshipMatrixResult | null;
  applyUiQuery: (query: MatrixQueryPreset['query']) => void;
  setBuiltQuery: (next: MatrixWorkspaceBuiltQuery | null) => void;
  bumpBuildNonce: () => void;
};

export function useMatrixSavedQueries(args: UseMatrixSavedQueriesArgs) {
  const { modelId, uiQuery, axesRowIds, axesColIds, builtQuery, result, applyUiQuery, setBuiltQuery, bumpBuildNonce } = args;

  const presetsState = useMatrixPresets({ modelId });

  const selectedPreset = useMemo(() => {
    if (!presetsState.presetId) return null;
    return presetsState.presets.find((p) => p.id === presetsState.presetId) ?? null;
  }, [presetsState.presetId, presetsState.presets]);

  const selectedSnapshot = useMemo(() => {
    if (!presetsState.snapshotId) return null;
    return presetsState.snapshots.find((p) => p.id === presetsState.snapshotId) ?? null;
  }, [presetsState.snapshotId, presetsState.snapshots]);

  const saveCurrentPreset = useCallback(
    (query?: MatrixQueryPreset['query']): void => {
      if (!modelId) return;
      const q = query ?? uiQuery;
      const name = window.prompt('Preset name?');
      if (!name) return;

      const preset: MatrixQueryPreset = {
        id: `preset_${Date.now()}`,
        name,
        createdAt: new Date().toISOString(),
        query: q,
      };

      const next = [preset, ...presetsState.presets].slice(0, 50);
      presetsState.savePresetList(next);
      presetsState.setPresetId(preset.id);
    },
    [modelId, presetsState, uiQuery]
  );

  const deleteSelectedPreset = useCallback((): void => {
    if (!modelId || !presetsState.presetId) return;
    const preset = presetsState.presets.find((p) => p.id === presetsState.presetId);
    const ok = window.confirm(`Delete preset “${preset?.name ?? 'Unnamed'}”?`);
    if (!ok) return;
    const next = presetsState.presets.filter((p) => p.id !== presetsState.presetId);
    presetsState.savePresetList(next);
    presetsState.setPresetId('');
  }, [modelId, presetsState]);

  const computeSnapshotSummary = useCallback(() => {
    if (!result) {
      return { rowCount: 0, colCount: 0, grandTotal: 0, missingCells: 0, nonZeroCells: 0 };
    }
    let missingCells = 0;
    let nonZeroCells = 0;
    for (const row of result.cells) {
      for (const cell of row) {
        if (cell.count === 0) missingCells += 1;
        else nonZeroCells += 1;
      }
    }
    return {
      rowCount: result.rows.length,
      colCount: result.cols.length,
      grandTotal: result.grandTotal,
      missingCells,
      nonZeroCells,
    };
  }, [result]);

  const saveSnapshot = useCallback(
    (query?: MatrixQueryPreset['query']): void => {
      if (!modelId) return;
      const q = query ?? uiQuery;
      const name = window.prompt('Snapshot name?');
      if (!name) return;

      const dir = mapAnalysisDirectionToMatrixDirection(q.direction);

      const snapshot = {
        id: `snapshot_${Date.now()}`,
        name,
        createdAt: new Date().toISOString(),
        builtQuery: {
          rowIds: builtQuery?.rowIds ?? axesRowIds,
          colIds: builtQuery?.colIds ?? axesColIds,
          direction: builtQuery?.direction ?? dir,
          relationshipTypes: builtQuery?.relationshipTypes ?? q.relationshipTypes,
        },
        uiQuery: q,
        summary: computeSnapshotSummary(),
      };

      const next = [snapshot, ...presetsState.snapshots].slice(0, 50);
      presetsState.saveSnapshotList(next);
      presetsState.setSnapshotId(snapshot.id);
    },
    [axesColIds, axesRowIds, builtQuery, computeSnapshotSummary, modelId, presetsState, uiQuery]
  );

  const deleteSnapshot = useCallback(
    (id: string): void => {
      if (!modelId) return;
      const snap = presetsState.snapshots.find((s) => s.id === id);
      const ok = window.confirm(`Delete snapshot “${snap?.name ?? 'Unnamed'}”?`);
      if (!ok) return;
      const next = presetsState.snapshots.filter((s) => s.id !== id);
      presetsState.saveSnapshotList(next);
      if (presetsState.snapshotId === id) presetsState.setSnapshotId('');
    },
    [modelId, presetsState]
  );

  const restoreSnapshot = useCallback(
    (id: string): void => {
      const snap = presetsState.snapshots.find((s) => s.id === id);
      if (!snap) return;
      presetsState.setSnapshotId(id);
      applyUiQuery(snap.uiQuery);
      setBuiltQuery({
        rowIds: snap.builtQuery.rowIds,
        colIds: snap.builtQuery.colIds,
        direction: snap.builtQuery.direction,
        relationshipTypes: snap.builtQuery.relationshipTypes,
      });
      bumpBuildNonce();
    },
    [applyUiQuery, bumpBuildNonce, presetsState, setBuiltQuery]
  );

  const applySelectedPreset = useCallback(() => {
    if (!selectedPreset) return;
    applyUiQuery(selectedPreset.query);
  }, [applyUiQuery, selectedPreset]);

  const applySelectedSnapshot = useCallback(() => {
    if (!selectedSnapshot) return;
    restoreSnapshot(selectedSnapshot.id);
  }, [restoreSnapshot, selectedSnapshot]);

  return {
    // storage state
    presets: presetsState.presets,
    presetId: presetsState.presetId,
    setPresetId: presetsState.setPresetId,

    snapshots: presetsState.snapshots,
    snapshotId: presetsState.snapshotId,
    setSnapshotId: presetsState.setSnapshotId,

    // selection
    selectedPreset,
    selectedSnapshot,

    // actions
    saveCurrentPreset,
    deleteSelectedPreset,
    saveSnapshot,
    deleteSnapshot,
    restoreSnapshot,
    applySelectedPreset,
    applySelectedSnapshot,
  } as const;
}

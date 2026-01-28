import { useCallback, useEffect, useState } from 'react';

import {
  loadMatrixPresets,
  loadMatrixSnapshots,
  saveMatrixPresets,
  saveMatrixSnapshots,
  type MatrixQueryPreset,
  type MatrixQuerySnapshot,
} from '../../matrixPresetsStorage';

export function useMatrixPresets(args: { modelId: string }) {
  const { modelId } = args;

  const [presets, setPresets] = useState<MatrixQueryPreset[]>([]);
  const [presetId, setPresetId] = useState<string>('');
  const [snapshots, setSnapshots] = useState<MatrixQuerySnapshot[]>([]);
  const [snapshotId, setSnapshotId] = useState<string>('');

  useEffect(() => {
    if (!modelId) return;
    setPresets(loadMatrixPresets(modelId));
    setSnapshots(loadMatrixSnapshots(modelId));
    setPresetId('');
    setSnapshotId('');
  }, [modelId]);

  const savePresetList = useCallback(
    (next: MatrixQueryPreset[]) => {
      setPresets(next);
      if (modelId) saveMatrixPresets(modelId, next);
    },
    [modelId]
  );

  const saveSnapshotList = useCallback(
    (next: MatrixQuerySnapshot[]) => {
      setSnapshots(next);
      if (modelId) saveMatrixSnapshots(modelId, next);
    },
    [modelId]
  );

  return {
    presets,
    presetId,
    setPresetId,
    savePresetList,

    snapshots,
    snapshotId,
    setSnapshotId,
    saveSnapshotList,
  };
}

import type { MatrixQueryPreset, MatrixQuerySnapshot } from '../matrixPresetsStorage';

export type MatrixPresetSnapshotControlsProps = {
  matrixPresets: MatrixQueryPreset[];
  matrixPresetId: string;
  onChangeMatrixPresetId: (id: string) => void;
  onSaveMatrixPreset: () => void;
  onApplyMatrixPreset: () => void;
  onDeleteMatrixPreset: () => void;

  matrixSnapshots: MatrixQuerySnapshot[];
  matrixSnapshotId: string;
  onChangeMatrixSnapshotId: (id: string) => void;
  canSaveMatrixSnapshot: boolean;
  onSaveMatrixSnapshot: () => void;
  onRestoreMatrixSnapshot: () => void;
  onDeleteMatrixSnapshot: () => void;
};

export function MatrixPresetSnapshotControls({
  matrixPresets,
  matrixPresetId,
  onChangeMatrixPresetId,
  onSaveMatrixPreset,
  onApplyMatrixPreset,
  onDeleteMatrixPreset,
  matrixSnapshots,
  matrixSnapshotId,
  onChangeMatrixSnapshotId,
  canSaveMatrixSnapshot,
  onSaveMatrixSnapshot,
  onRestoreMatrixSnapshot,
  onDeleteMatrixSnapshot
}: MatrixPresetSnapshotControlsProps) {
  return (
    <div className="toolbar" aria-label="Matrix presets toolbar" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
      <div className="toolbarGroup" style={{ minWidth: 220 }}>
        <label htmlFor="matrix-preset">Preset</label>
        <select
          id="matrix-preset"
          className="selectInput"
          value={matrixPresetId}
          onChange={(e) => onChangeMatrixPresetId(e.target.value)}
        >
          <option value="">(none)</option>
          {matrixPresets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="toolbarGroup">
        <label style={{ visibility: 'hidden' }} aria-hidden="true">
          Actions
        </label>
        <button type="button" className="shellButton" onClick={onSaveMatrixPreset}>
          Save preset
        </button>
      </div>

      <div className="toolbarGroup">
        <label style={{ visibility: 'hidden' }} aria-hidden="true">
          Apply
        </label>
        <button type="button" className="shellButton" disabled={!matrixPresetId} onClick={onApplyMatrixPreset}>
          Apply
        </button>
      </div>

      <div className="toolbarGroup">
        <label style={{ visibility: 'hidden' }} aria-hidden="true">
          Delete
        </label>
        <button type="button" className="shellButton" disabled={!matrixPresetId} onClick={onDeleteMatrixPreset}>
          Delete
        </button>
      </div>

      <div className="toolbarGroup">
        <label style={{ visibility: 'hidden' }} aria-hidden="true">
          Snapshot
        </label>
        <button type="button" className="shellButton" disabled={!canSaveMatrixSnapshot} onClick={onSaveMatrixSnapshot}>
          Save snapshot
        </button>
      </div>

      <div className="toolbarGroup" style={{ minWidth: 240 }}>
        <label htmlFor="matrix-snapshot">Snapshot</label>
        <select
          id="matrix-snapshot"
          className="selectInput"
          value={matrixSnapshotId}
          onChange={(e) => onChangeMatrixSnapshotId(e.target.value)}
        >
          <option value="">(none)</option>
          {matrixSnapshots.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="toolbarGroup">
        <label style={{ visibility: 'hidden' }} aria-hidden="true">
          Restore
        </label>
        <button type="button" className="shellButton" disabled={!matrixSnapshotId} onClick={onRestoreMatrixSnapshot}>
          Restore
        </button>
      </div>

      <div className="toolbarGroup">
        <label style={{ visibility: 'hidden' }} aria-hidden="true">
          Delete snapshot
        </label>
        <button type="button" className="shellButton" disabled={!matrixSnapshotId} onClick={onDeleteMatrixSnapshot}>
          Delete snapshot
        </button>
      </div>
    </div>
  );
}

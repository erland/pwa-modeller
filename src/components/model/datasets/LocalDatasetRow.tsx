import type { DatasetId } from '../../../store';
import type { LocalDatasetRow as Row, RowMode } from './useLocalDatasetsDialogModel';

type Props = {
  row: Row;
  activeDatasetId: DatasetId;
  mode: RowMode;
  busyId: DatasetId | null;
  onOpen: (id: DatasetId) => void;
  onStartRename: (id: DatasetId, currentName: string) => void;
  onRenameDraftChange: (id: DatasetId, draft: string) => void;
  onRenameSave: (id: DatasetId, name: string) => void;
  onRenameCancel: (id: DatasetId) => void;
  onDelete: (id: DatasetId) => void;
};

export function LocalDatasetRow(props: Props) {
  const { row: r, activeDatasetId, mode, busyId } = props;
  const isActive = r.datasetId === activeDatasetId;
  const isBusy = busyId === r.datasetId;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 10,
        padding: 10,
        borderRadius: 10,
        border: '1px solid var(--panelBorder, rgba(255,255,255,0.08))',
        background: isActive ? 'rgba(100, 150, 255, 0.12)' : 'transparent'
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
          {mode.kind === 'rename' ? (
            <input
              data-autofocus="true"
              type="text"
              value={mode.draft}
              onChange={(e) => props.onRenameDraftChange(r.datasetId, e.currentTarget.value)}
              style={{
                width: '100%',
                minWidth: 0,
                padding: '6px 8px',
                borderRadius: 8,
                border: '1px solid var(--panelBorder, rgba(255,255,255,0.12))',
                background: 'var(--panelBg, rgba(0,0,0,0.15))',
                color: 'inherit'
              }}
            />
          ) : (
            <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.name}
              {isActive ? ' (active)' : ''}
            </div>
          )}
        </div>

        <div style={{ fontSize: 12, opacity: 0.8, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span title={r.datasetId}>
            ID: {String(r.datasetId).slice(0, 24)}
            {String(r.datasetId).length > 24 ? '…' : ''}
          </span>
          <span>Updated: {new Date(r.updatedAt).toLocaleString()}</span>
          {r.lastOpenedAt ? <span>Opened: {new Date(r.lastOpenedAt).toLocaleString()}</span> : null}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {mode.kind === 'rename' ? (
          <>
            <button
              type="button"
              className="shellButton"
              disabled={isBusy || !mode.draft.trim()}
              onClick={() => props.onRenameSave(r.datasetId, mode.draft.trim())}
            >
              Save
            </button>
            <button type="button" className="shellButton" disabled={isBusy} onClick={() => props.onRenameCancel(r.datasetId)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="shellButton"
              disabled={isBusy || isActive}
              title={isActive ? 'Already active' : 'Open this dataset'}
              onClick={() => props.onOpen(r.datasetId)}
            >
              Open
            </button>
            <button
              type="button"
              className="shellButton"
              disabled={isBusy}
              onClick={() => props.onStartRename(r.datasetId, r.name)}
            >
              Rename
            </button>
            <button type="button" className="shellButton" disabled={isBusy} onClick={() => props.onDelete(r.datasetId)}>
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}

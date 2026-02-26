import type { RemoteDatasetListItem } from '../../../store/remoteDatasetApi';

type Props = {
  row: RemoteDatasetListItem;
  busyId: string | null;
  onOpen: (serverDatasetId: string, displayName: string) => void;
};

export function RemoteDatasetRow({ row: r, busyId, onOpen }: Props) {
  const isBusy = busyId === r.datasetId;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 10,
        padding: 10,
        borderRadius: 10,
        border: '1px solid var(--panelBorder, rgba(255,255,255,0.08))'
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
        {r.description ? <div style={{ fontSize: 12, opacity: 0.85 }}>{r.description}</div> : null}
        <div style={{ fontSize: 12, opacity: 0.75, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span title={r.datasetId}>
            ID: {String(r.datasetId).slice(0, 24)}
            {String(r.datasetId).length > 24 ? '…' : ''}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          type="button"
          className="shellButton"
          disabled={isBusy}
          title="Open this remote dataset"
          onClick={() => onOpen(r.datasetId, r.name)}
        >
          Open
        </button>
      </div>
    </div>
  );
}

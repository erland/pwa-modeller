import { Dialog } from '../../dialog/Dialog';
import { RemoteDatasetRow } from './RemoteDatasetRow';
import { useRemoteDatasetsDialogModel } from './useRemoteDatasetsDialogModel';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export function RemoteDatasetsDialog({ isOpen, onClose }: Props) {
  const m = useRemoteDatasetsDialogModel({ isOpen, onClose });

  return (
    <Dialog
      title="Remote datasets"
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            {m.loading ? 'Loading…' : `${m.rows.length} dataset${m.rows.length === 1 ? '' : 's'}`}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="shellButton"
              onClick={() => void m.refresh()}
              disabled={m.loading || !m.canConnect}
              title={!m.canConnect ? 'Set baseUrl + token first' : undefined}
            >
              Refresh
            </button>
            <button type="button" className="shellButton" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="crudHint" style={{ marginTop: 0 }}>
          Connect to a server-backed dataset store. Phase 1 uses a pasted Bearer token.
        </div>

        {m.error ? (
          <div className="crudHint" style={{ marginTop: 0, borderLeftColor: 'var(--danger, #c33)' }}>
            {m.error}
          </div>
        ) : null}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr',
            gap: 10,
            padding: 10,
            borderRadius: 10,
            border: '1px solid var(--panelBorder, rgba(255,255,255,0.08))'
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10, alignItems: 'center' }}>
            <div style={{ fontSize: 12, opacity: 0.85 }}>Base URL</div>
            <input
              type="text"
              value={m.baseUrl}
              onChange={(e) => m.setBaseUrl(e.currentTarget.value)}
              placeholder="http://localhost:8081"
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
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10, alignItems: 'center' }}>
            <div style={{ fontSize: 12, opacity: 0.85 }}>Token</div>
            <input
              type="password"
              value={m.token}
              onChange={(e) => m.setToken(e.currentTarget.value)}
              placeholder="paste access token"
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
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="shellButton" onClick={() => m.persistSettings()} disabled={!m.baseUrl.trim()}>
              Save settings
            </button>
            <button type="button" className="shellButton" onClick={() => m.doClearToken()} disabled={!m.token.trim()}>
              Clear token
            </button>
            <button type="button" className="shellButton" onClick={() => void m.refresh()} disabled={m.loading || !m.canConnect}>
              Connect
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr',
            gap: 10,
            padding: 10,
            borderRadius: 10,
            border: '1px solid var(--panelBorder, rgba(255,255,255,0.08))'
          }}
        >
          <div style={{ fontWeight: 600 }}>Create dataset</div>
          <input
            type="text"
            value={m.createName}
            onChange={(e) => m.setCreateName(e.currentTarget.value)}
            placeholder="Name"
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
          <input
            type="text"
            value={m.createDesc}
            onChange={(e) => m.setCreateDesc(e.currentTarget.value)}
            placeholder="Description (optional)"
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
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              type="button"
              className="shellButton"
              disabled={m.loading || !m.canConnect || !m.createName.trim()}
              onClick={() => void m.doCreate()}
            >
              Create
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {m.rows.map((r) => (
            <RemoteDatasetRow key={r.datasetId} row={r} busyId={m.busyId} onOpen={(id, name) => void m.doOpen(id, name)} />
          ))}
        </div>
      </div>
    </Dialog>
  );
}

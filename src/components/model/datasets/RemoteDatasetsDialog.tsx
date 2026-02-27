import { Dialog } from '../../dialog/Dialog';
import { RemoteDatasetRow } from './RemoteDatasetRow';
import { RemoteDatasetHistoryDialog } from './RemoteDatasetHistoryDialog';
import { useRemoteDatasetsDialogModel } from './useRemoteDatasetsDialogModel';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export function RemoteDatasetsDialog({ isOpen, onClose }: Props) {
  const m = useRemoteDatasetsDialogModel({ isOpen, onClose });

  return (
    <>
      <Dialog
        title="Remote datasets"
        isOpen={isOpen}
        onClose={onClose}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              {m.loading ? 'Loading…' : m.loggedIn ? `${m.rows.length} dataset${m.rows.length === 1 ? '' : 's'}` : 'Signed out'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="shellButton"
                onClick={() => void m.refresh()}
                disabled={m.loading || !m.canConnect}
                title={!m.canConnect ? 'Set baseUrl and sign in first' : undefined}
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
          Connect to a server-backed dataset store. Phase 1 uses OIDC (PKCE redirect) for sign-in.
        </div>

        {m.error ? (
          <div className="crudHint" style={{ marginTop: 0, borderLeftColor: 'var(--danger, #c33)' }}>
            {m.error}
          </div>
        ) : null}

        {/* Connection + auth settings (always visible) */}
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
          <div style={{ fontWeight: 600 }}>Connection</div>

          <label style={{ display: 'grid', gap: 4 }}>
            <div style={{ fontSize: 12, opacity: 0.85 }}>Server base URL</div>
            <input
              type="text"
              value={m.baseUrl}
              onChange={(e) => m.setBaseUrl(e.currentTarget.value)}
              placeholder="http://localhost:8080"
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
          </label>

          <label style={{ display: 'grid', gap: 4 }}>
            <div style={{ fontSize: 12, opacity: 0.85 }}>Keycloak issuer URL (realm)</div>
            <input
              type="text"
              value={m.issuerUrl}
              onChange={(e) => m.setIssuerUrl(e.currentTarget.value)}
              placeholder="http://localhost:18080/realms/modeller"
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
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 12, opacity: 0.85 }}>Client ID</div>
              <input
                type="text"
                value={m.clientId}
                onChange={(e) => m.setClientId(e.currentTarget.value)}
                placeholder="pwa-modeller"
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
            </label>

            <label style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 12, opacity: 0.85 }}>Scope</div>
              <input
                type="text"
                value={m.scope}
                onChange={(e) => m.setScope(e.currentTarget.value)}
                placeholder="openid profile email"
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
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="shellButton" onClick={() => m.persistSettings()} disabled={m.loading}>
              Save settings
            </button>

            {!m.loggedIn ? (
              <button
                type="button"
                className="shellButton"
                onClick={() => void m.doSignIn()}
                disabled={!m.canSignIn || m.loading}
                title={!m.canSignIn ? 'Set issuer URL + client id first' : undefined}
              >
                Sign in
              </button>
            ) : (
              <button type="button" className="shellButton" onClick={() => void m.doSignOut()} disabled={m.loading}>
                Sign out
              </button>
            )}
          </div>
        </div>

        {/* List + create are only available when logged in */}
        {m.loggedIn ? (
          <>
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
              <label style={{ display: 'grid', gap: 4 }}>
                <div style={{ fontSize: 12, opacity: 0.85 }}>Validation policy</div>
                <select
                  value={m.createValidationPolicy}
                  onChange={(e) => m.setCreateValidationPolicy(e.currentTarget.value as any)}
                  style={{
                    width: '100%',
                    minWidth: 0,
                    padding: '6px 8px',
                    borderRadius: 8,
                    border: '1px solid var(--panelBorder, rgba(255,255,255,0.12))',
                    background: 'var(--panelBg, rgba(0,0,0,0.15))',
                    color: 'inherit'
                  }}
                >
                  <option value="none">none (no server validation)</option>
                  <option value="basic">basic</option>
                  <option value="strict">strict</option>
                </select>
                <div style={{ fontSize: 11, opacity: 0.75, lineHeight: 1.3 }}>
                  Choose how strictly the server should validate your model on save. Stricter policies may reject invalid data.
                </div>
              </label>

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
                <RemoteDatasetRow
                  key={r.datasetId}
                  row={r}
                  busyId={m.busyId}
                  onOpen={(id, name) => void m.doOpen(id, name)}
                  onHistory={(id, name) => void m.openHistory(id, name)}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="crudHint" style={{ marginTop: 0 }}>
            Sign in to list and create remote datasets.
          </div>
        )}
        </div>
      </Dialog>

      <RemoteDatasetHistoryDialog
        isOpen={m.historyOpen}
        datasetName={m.historyDatasetName}
        items={m.historyItems}
        loading={m.historyLoading}
        error={m.historyError}
        canRestore={m.canRestoreFromHistory}
        canForceRestore={m.canForceRestoreFromHistory}
        onClose={m.closeHistory}
        onRefresh={() => void m.refreshHistory()}
        onRestore={(rev, msg, opts) => void m.doRestoreRevision(rev, msg, opts)}
      />
    </>
  );
}

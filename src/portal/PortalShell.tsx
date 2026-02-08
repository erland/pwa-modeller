import { ChangeEvent, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { PortalStoreProvider, usePortalStore } from './store/usePortalStore';

const PORTAL_LATEST_URL_LOCALSTORAGE_KEY = 'portal.latestUrl';

type LatestPointer = {
  bundleId: string;
  manifestUrl: string;
  title?: string;
  channel?: string;
};

function isLatestPointer(v: any): v is LatestPointer {
  return Boolean(v && typeof v === 'object' && typeof v.bundleId === 'string' && typeof v.manifestUrl === 'string');
}

function normalizeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  return s.length > 0 ? s : null;
}

function PortalTopBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { datasetMeta, status, error, latest, setLatestUrl, load, clearCache } = usePortalStore();
  const [query, setQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [latestUrlDraft, setLatestUrlDraft] = useState<string>(latest.latestUrl ?? '');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState<string>('');

  const datasetLabel = useMemo(() => {
    if (!datasetMeta) return 'No dataset loaded';
    const title = datasetMeta.title?.trim() || 'Unnamed dataset';
    const bundle = datasetMeta.bundleId ? ` — ${datasetMeta.bundleId}` : '';
    return `${title}${bundle}`;
  }, [datasetMeta]);

  const statusLabel = useMemo(() => {
    if (status === 'loading') return 'Loading…';
    if (status === 'error') return 'Error';
    if (datasetMeta?.loadedFromCache) return 'Cached';
    if (status === 'ready') return 'Ready';
    return '';
  }, [datasetMeta?.loadedFromCache, status]);

  const onChangeQuery = (e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value);

  const openDialog = () => {
    setLatestUrlDraft(latest.latestUrl ?? '');
    setTestStatus('idle');
    setTestMessage('');
    setIsDialogOpen(true);
  };

  const testConnection = async () => {
    const url = normalizeUrl(latestUrlDraft);
    if (!url) {
      setTestStatus('error');
      setTestMessage('Please enter a URL to latest.json');
      return;
    }

    setTestStatus('testing');
    setTestMessage('Fetching latest.json...');

    try {
      const resp = await fetch(url, { cache: 'no-cache' });
      if (!resp.ok) {
        setTestStatus('error');
        setTestMessage(`HTTP ${resp.status} while fetching latest.json`);
        return;
      }
      const json = await resp.json();
      if (!isLatestPointer(json)) {
        setTestStatus('error');
        setTestMessage('latest.json schema is invalid. Expected { bundleId, manifestUrl, (optional) title }.');
        return;
      }
      setTestStatus('ok');
      const title = typeof json.title === 'string' && json.title.trim() ? ` — ${json.title.trim()}` : '';
      setTestMessage(`OK: bundleId=${json.bundleId}${title}`);
    } catch (e: any) {
      setTestStatus('error');
      setTestMessage(e?.message ? String(e.message) : 'Failed to fetch latest.json');
    }
  };

  const useThisDataset = () => {
    const url = normalizeUrl(latestUrlDraft);
    if (!url) {
      setTestStatus('error');
      setTestMessage('Please enter a URL to latest.json');
      return;
    }
    try {
      window.localStorage.setItem(PORTAL_LATEST_URL_LOCALSTORAGE_KEY, url);
    } catch {
      // ignore
    }
    setLatestUrl(url, 'localStorage');
    void load(url);
    setIsDialogOpen(false);
  };

  const onSearch = () => {
    // Search will be implemented in Step 4/5 when we have indexes.
    if (!query.trim()) return;
    // For now, just keep the input as a placeholder. No navigation.
  };

  const canSearch = Boolean(datasetMeta);

  return (
    <>
      <div style={styles.topBar}>
      <div style={styles.topLeft}>
        <Link to="/portal" style={styles.brand}>
          EA Portal
        </Link>
        <div style={styles.dataset} title={datasetLabel}>
          {datasetLabel}
        </div>
        {statusLabel ? (
          <div style={styles.statusPill} title={error ?? undefined}>
            {statusLabel}
          </div>
        ) : null}
      </div>

      <div style={styles.topCenter}>
        <input
          value={query}
          onChange={onChangeQuery}
          placeholder={canSearch ? 'Search (coming soon)' : 'Load a dataset to search'}
          disabled={!canSearch}
          style={styles.searchInput}
        />
        <button onClick={onSearch} disabled={!canSearch} style={styles.button}>
          Search
        </button>
        <button onClick={openDialog} style={styles.button}>
          Change dataset
        </button>
      </div>

      <div style={styles.topRight}>
        <button onClick={() => navigate('/')} style={styles.button} title="Back to the modelling workspace">
          Back to Modeller
        </button>

        <div style={styles.routeHint} title={location.pathname}>
          {location.pathname}
        </div>
      </div>
      </div>

      {isDialogOpen && (
        <div style={styles.modalBackdrop} role="dialog" aria-modal="true">
          <div style={styles.modalCard}>
            <div style={styles.modalTitle}>Change dataset</div>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 10 }}>
              Configure the URL to <code>latest.json</code>. You can also pass it on startup via{' '}
              <code>?bundleUrl=...</code> (or <code>?latestUrl=...</code>).
            </div>

            <label style={styles.modalLabel}>latest.json URL</label>
            <input
              value={latestUrlDraft}
              onChange={(e) => setLatestUrlDraft(e.target.value)}
              placeholder="https://.../latest.json"
              style={styles.modalInput}
              autoFocus
            />

            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>
              Current source: <strong>{latest.latestUrlSource ?? '—'}</strong>
            </div>

            {testStatus !== 'idle' && (
              <div
                style={{
                  ...styles.testBox,
                  opacity: testStatus === 'testing' ? 0.8 : 1
                }}
              >
                <strong style={{ marginRight: 8 }}>
                  {testStatus === 'testing'
                    ? 'Testing'
                    : testStatus === 'ok'
                      ? 'OK'
                      : 'Error'}
                </strong>
                <span>{testMessage}</span>
              </div>
            )}

            <div style={styles.modalActions}>
              <button onClick={() => setIsDialogOpen(false)} style={styles.button}>
                Cancel
              </button>
              <button
                onClick={() => void clearCache()}
                style={styles.button}
                title="Clears cached bundles for the current latest.json URL"
              >
                Clear cache
              </button>
              <button onClick={testConnection} style={styles.button} disabled={testStatus === 'testing'}>
                Test connection
              </button>
              <button onClick={useThisDataset} style={styles.primaryButton}>
                Use this dataset
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PortalShellInner() {
  return (
    <div style={styles.shell}>
      <PortalTopBar />
      <div style={styles.content}>
        <Outlet />
      </div>
    </div>
  );
}

export default function PortalShell() {
  return (
    <PortalStoreProvider>
      <PortalShellInner />
    </PortalStoreProvider>
  );
}

const styles: Record<string, CSSProperties> = {
  shell: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    width: '100%'
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '10px 12px',
    borderBottom: '1px solid var(--borderColor, rgba(0,0,0,0.12))'
  },
  topLeft: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 10,
    minWidth: 260
  },
  brand: {
    fontWeight: 700,
    textDecoration: 'none',
    color: 'inherit'
  },
  dataset: {
    fontSize: 12,
    opacity: 0.8,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 420
  },
  statusPill: {
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 999,
    border: '1px solid var(--borderColor, rgba(0,0,0,0.18))',
    background: 'rgba(0,0,0,0.03)',
    opacity: 0.9
  },
  topCenter: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    justifyContent: 'center'
  },
  topRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'flex-end',
    minWidth: 280
  },
  searchInput: {
    width: 'min(520px, 45vw)',
    padding: '7px 10px',
    borderRadius: 8,
    border: '1px solid var(--borderColor, rgba(0,0,0,0.2))'
  },
  button: {
    padding: '7px 10px',
    borderRadius: 8,
    border: '1px solid var(--borderColor, rgba(0,0,0,0.2))',
    background: 'var(--buttonBg, transparent)',
    cursor: 'pointer'
  },
  primaryButton: {
    padding: '7px 10px',
    borderRadius: 8,
    border: '1px solid var(--borderColor, rgba(0,0,0,0.2))',
    background: 'rgba(0,0,0,0.06)',
    cursor: 'pointer',
    fontWeight: 600
  },
  modalBackdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    zIndex: 1000
  },
  modalCard: {
    width: 'min(720px, 92vw)',
    borderRadius: 12,
    background: 'var(--panelBg, #fff)',
    border: '1px solid var(--borderColor, rgba(0,0,0,0.12))',
    boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
    padding: 16
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 8
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: 600,
    opacity: 0.85
  },
  modalInput: {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 10,
    border: '1px solid var(--borderColor, rgba(0,0,0,0.2))',
    marginTop: 6
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 14
  },
  testBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    border: '1px solid var(--borderColor, rgba(0,0,0,0.12))',
    background: 'rgba(0,0,0,0.02)',
    fontSize: 12
  },
  routeHint: {
    fontSize: 11,
    opacity: 0.55,
    maxWidth: 240,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: 16
  }
};

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';

import { PortalStoreProvider, usePortalStore } from './store/usePortalStore';
import { fetchLatest, PortalFetchError } from './data/portalDataset';
import { search as searchIndex } from './indexes/portalIndexes';

const CHANNELS = ['prod', 'test', 'demo', 'custom'];

function formatTestError(e: any): string {
  if (e instanceof PortalFetchError) {
    return e.message + (e.details ? `\nDetails: ${e.details}` : '');
  }
  return e?.message ? String(e.message) : String(e);
}

function normalizeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  return s.length > 0 ? s : null;
}

function PortalTopBar() {
  const navigate = useNavigate();
  const { datasetMeta, status, error, latest, indexes, updateInfo, setChannel, setLatestUrl, load, checkForUpdate, applyUpdate, clearCache } = usePortalStore();

  const [query, setQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const [channelDraft, setChannelDraft] = useState<string>(latest.channel ?? 'prod');
  const [latestUrlDraft, setLatestUrlDraft] = useState<string>(latest.latestUrl ?? '');

  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState<string>('');

  // Poll for updates (Step 10)
  useEffect(() => {
    if (status !== 'ready') return;
    // check on start
    void checkForUpdate();

    const id = window.setInterval(() => {
      void checkForUpdate();
    }, 5 * 60 * 1000);

    return () => window.clearInterval(id);
  }, [checkForUpdate, status]);

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
    setChannelDraft(latest.channel ?? 'prod');
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
      const latest = await fetchLatest(url);
      setTestStatus('ok');
      const title = latest.title?.trim() ? ` — ${latest.title.trim()}` : '';
      setTestMessage(`OK: bundleId=${latest.bundleId}${title}`);
    } catch (e: any) {
      setTestStatus('error');
      setTestMessage(formatTestError(e));
    }
  };

  const useThisDataset = () => {
    const url = normalizeUrl(latestUrlDraft);
    if (!url) {
      setTestStatus('error');
      setTestMessage('Please enter a URL to latest.json');
      return;
    }

    setChannel(channelDraft, 'localStorage');
    setLatestUrl(url, 'localStorage');
    void load(url);

    setIsDialogOpen(false);
  };

  const onSearch = () => {
    if (!query.trim()) return;
    if (!indexes) return;

    const results = searchIndex(indexes, query, { limit: 10 });
    if (!results.length) return;

    navigate(`/portal/e/${encodeURIComponent(results[0].id)}`);
    setQuery('');
  };

  const canSearch = Boolean(datasetMeta);
  const searchResults = useMemo(() => {
    if (!canSearch) return [];
    if (!indexes) return [];
    const q = query.trim();
    if (!q) return [];
    return searchIndex(indexes, q, { limit: 8 });
  }, [canSearch, indexes, query]);

  const updateBanner = useMemo(() => {
    if (updateInfo.state !== 'available') return null;
    return (
      <div style={styles.updateBanner}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <strong>Update available</strong>: {updateInfo.currentBundleId} → {updateInfo.latestBundleId}
            {updateInfo.latestTitle ? <span style={{ opacity: 0.85 }}> ({updateInfo.latestTitle})</span> : null}
          </div>
          <button style={styles.bannerButton} onClick={() => void applyUpdate()}>
            Reload
          </button>
          <button style={styles.bannerButtonSecondary} onClick={() => void checkForUpdate()}>
            Check again
          </button>
        </div>
      </div>
    );
  }, [applyUpdate, checkForUpdate, updateInfo]);

  return (
    <>
      <div style={styles.topBar}>
        <div style={styles.topLeft}>
          <Link to="/" style={styles.brand}>
            EA Modeller
          </Link>
          <span style={styles.sep}>/</span>
          <Link to="/portal" style={styles.portalLink}>
            Portal
          </Link>

          <span style={styles.datasetLabel}>{datasetLabel}</span>
          {statusLabel ? <span style={styles.statusPill}>{statusLabel}</span> : null}
          {latest.channel ? <span style={styles.channelPill}>{latest.channel}</span> : null}
        </div>

        <div style={styles.topRight}>
          <div style={styles.searchWrap}>
            <input
              placeholder={canSearch ? 'Search elements…' : 'Load a dataset to search'}
              value={query}
              onChange={onChangeQuery}
              onKeyDown={(e) => (e.key === 'Enter' ? onSearch() : null)}
              disabled={!canSearch}
              style={styles.searchInput}
            />
            <button onClick={onSearch} disabled={!canSearch} style={styles.searchButton}>
              Search
            </button>
            {searchResults.length ? (
              <div style={styles.searchResults}>
                {searchResults.map((r) => (
                  <button
                    key={r.id}
                    style={styles.searchResultRow}
                    onClick={() => {
                      navigate(`/portal/e/${encodeURIComponent(r.id)}`);
                      setQuery('');
                    }}
                  >
                    <div style={styles.searchResultTitle}>{r.label}</div>
                    <div style={styles.searchResultMeta}>{r.meta}</div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <button style={styles.topButton} onClick={openDialog}>
            Change dataset
          </button>

          <Link to="/" style={styles.topButtonLink}>
            Back to Modeller
          </Link>
        </div>
      </div>

      {updateBanner}

      {status === 'error' && error ? (
        <div style={styles.errorBar}>
          <div style={{ whiteSpace: 'pre-wrap' }}>{error}</div>
        </div>
      ) : null}

      {isDialogOpen ? (
        <div style={styles.dialogBackdrop} onMouseDown={() => setIsDialogOpen(false)}>
          <div style={styles.dialog} onMouseDown={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Change dataset</h3>

            <div style={styles.formRow}>
              <label style={styles.label}>Channel</label>
              <select
                value={channelDraft}
                onChange={(e) => {
                  const c = e.target.value;
                  setChannelDraft(c);
                  // Best-effort: switch channel in store to load saved URL (if present)
                  setChannel(c, 'localStorage');
                  setLatestUrlDraft((prev) => normalizeUrl(latest.latestUrl) ?? prev);
                }}
                style={styles.select}
              >
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.formRow}>
              <label style={styles.label}>latest.json URL</label>
              <input value={latestUrlDraft} onChange={(e) => setLatestUrlDraft(e.target.value)} style={styles.input} />
            </div>

            <div style={styles.smallText}>
              Startup precedence: <code>?bundleUrl=</code> / <code>?latestUrl=</code>, then per-channel localStorage, then <code>/config.json</code>, then <code>/latest.json</code>.
            </div>

            <div style={styles.dialogActions}>
              <button onClick={testConnection} style={styles.button}>
                {testStatus === 'testing' ? 'Testing…' : 'Test connection'}
              </button>

              <button onClick={useThisDataset} style={styles.buttonPrimary}>
                Use this dataset
              </button>

              <button
                onClick={() => {
                  void clearCache();
                  setTestStatus('idle');
                  setTestMessage('Cache cleared for this latest.json URL.');
                }}
                style={styles.button}
              >
                Clear cache
              </button>

              <button onClick={() => setIsDialogOpen(false)} style={styles.button}>
                Close
              </button>
            </div>

            {testMessage ? (
              <pre style={styles.testBox}>
                {testMessage}
              </pre>
            ) : null}

            <div style={styles.smallText}>
              Tip: you can pass <code>?channel=prod</code> (or test/demo) and/or <code>?bundleUrl=…</code> when sharing links.
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function PortalShell() {
  return (
    <PortalStoreProvider>
      <PortalTopBar />
      <div style={styles.body}>
        <Outlet />
      </div>
    </PortalStoreProvider>
  );
}

const styles: Record<string, CSSProperties> = {
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    borderBottom: '1px solid rgba(0,0,0,0.12)',
    position: 'sticky',
    top: 0,
    background: 'var(--surface, #fff)',
    zIndex: 10
  },
  topLeft: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 },
  topRight: { display: 'flex', alignItems: 'center', gap: 10 },
  brand: { textDecoration: 'none', fontWeight: 700, color: 'inherit' },
  portalLink: { textDecoration: 'none', fontWeight: 600, color: 'inherit', opacity: 0.9 },
  sep: { opacity: 0.4 },
  datasetLabel: { fontWeight: 600, opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 520 },
  statusPill: { fontSize: 12, padding: '2px 8px', borderRadius: 999, border: '1px solid rgba(0,0,0,0.2)', opacity: 0.85 },
  channelPill: { fontSize: 12, padding: '2px 8px', borderRadius: 999, border: '1px dashed rgba(0,0,0,0.25)', opacity: 0.8 },

  searchWrap: { position: 'relative' },
  searchInput: { width: 280, padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.22)' },
  searchButton: { marginLeft: 8, padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.22)', background: 'transparent' },
  searchResults: {
    position: 'absolute',
    top: 40,
    left: 0,
    right: 0,
    background: 'var(--surface, #fff)',
    border: '1px solid rgba(0,0,0,0.18)',
    borderRadius: 10,
    boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
    padding: 6,
    zIndex: 20
  },
  searchResultRow: { width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer' },
  searchResultTitle: { fontWeight: 700, fontSize: 13 },
  searchResultMeta: { fontSize: 12, opacity: 0.7 },

  topButton: { padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.22)', background: 'transparent' },
  topButtonLink: { padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.22)', textDecoration: 'none', color: 'inherit', background: 'transparent' },

  updateBanner: {
    padding: '10px 14px',
    borderBottom: '1px solid rgba(0,0,0,0.12)',
    background: 'rgba(255, 240, 200, 0.6)'
  },
  bannerButton: { padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.22)', background: 'rgba(0,0,0,0.04)' },
  bannerButtonSecondary: { padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.18)', background: 'transparent', opacity: 0.85 },

  errorBar: {
    padding: '10px 14px',
    background: 'rgba(255, 220, 220, 0.65)',
    borderBottom: '1px solid rgba(0,0,0,0.12)'
  },

  body: { padding: 14 },

  dialogBackdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: 80, zIndex: 50 },
  dialog: { width: 720, maxWidth: '90vw', background: 'var(--surface, #fff)', borderRadius: 12, padding: 16, border: '1px solid rgba(0,0,0,0.12)' },
  formRow: { display: 'grid', gridTemplateColumns: '140px 1fr', gap: 10, alignItems: 'center', marginBottom: 10 },
  label: { fontWeight: 700, fontSize: 13, opacity: 0.9 },
  input: { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.22)' },
  select: { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.22)' },

  smallText: { fontSize: 12, opacity: 0.75, marginTop: 8 },

  dialogActions: { display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 },
  button: { padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.22)', background: 'transparent' },
  buttonPrimary: { padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.22)', background: 'rgba(0,0,0,0.06)', fontWeight: 700 },

  testBox: { marginTop: 12, background: 'rgba(0,0,0,0.04)', padding: 10, borderRadius: 10, whiteSpace: 'pre-wrap' }
};

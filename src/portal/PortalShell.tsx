import { ChangeEvent, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { PortalStoreProvider, usePortalStore } from './store/usePortalStore';

function PortalTopBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { datasetMeta } = usePortalStore();
  const [query, setQuery] = useState('');

  const datasetLabel = useMemo(() => {
    if (!datasetMeta) return 'No dataset loaded';
    const title = datasetMeta.title?.trim() || 'Unnamed dataset';
    const bundle = datasetMeta.bundleId ? ` — ${datasetMeta.bundleId}` : '';
    return `${title}${bundle}`;
  }, [datasetMeta]);

  const onChangeQuery = (e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value);

  const onSearch = () => {
    // Search will be implemented in Step 4/5 when we have indexes.
    if (!query.trim()) return;
    // For now, just keep the input as a placeholder. No navigation.
  };

  const canSearch = Boolean(datasetMeta);

  return (
    <div style={styles.topBar}>
      <div style={styles.topLeft}>
        <Link to="/portal" style={styles.brand}>
          EA Portal
        </Link>
        <div style={styles.dataset} title={datasetLabel}>
          {datasetLabel}
        </div>
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
        <button
          onClick={() => {
            // Step 2 adds a proper dialog + URL override.
            // For now: keep it explicit that it is not wired.
            window.alert('Change dataset is not implemented yet (Step 2).');
          }}
          style={styles.button}
        >
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

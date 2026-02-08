import { Link } from 'react-router-dom';

import { usePortalStore } from '../store/usePortalStore';

export default function PortalHomePage() {
  const { datasetMeta, latest, status, error } = usePortalStore();

  return (
    <div style={{ maxWidth: 900 }}>
      <h2 style={{ marginTop: 0 }}>Portal</h2>

      {!datasetMeta ? (
        <div style={{ padding: 12, border: '1px solid var(--borderColor, rgba(0,0,0,0.12))', borderRadius: 12 }}>
          <strong>{status === 'loading' ? 'Loading dataset…' : status === 'error' ? 'Failed to load dataset.' : 'No dataset loaded.'}</strong>
          <div style={{ marginTop: 8, opacity: 0.85 }}>
            This portal is read-only.
          </div>
          {status === 'error' && error ? (
            <div style={{ marginTop: 8, color: 'var(--danger, #b42318)' }}>
              {error}
            </div>
          ) : null}
          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85 }}>
            Configured latest.json URL:{' '}
            <code>{latest.latestUrl ?? '—'}</code>
            {latest.latestUrlSource ? (
              <span style={{ marginLeft: 8 }}>
                (source: <strong>{latest.latestUrlSource}</strong>)
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <div>
          <div style={{ opacity: 0.85 }}>
            Loaded dataset: <strong>{datasetMeta.title ?? 'Unnamed dataset'}</strong>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>
            bundleId: <code>{datasetMeta.bundleId}</code>
            {datasetMeta.createdAt ? (
              <span style={{ marginLeft: 10 }}>
                createdAt: <code>{datasetMeta.createdAt}</code>
              </span>
            ) : null}
            {datasetMeta.loadedFromCache ? (
              <span style={{ marginLeft: 10 }}>(loaded from cache)</span>
            ) : null}
            {datasetMeta.indexesDerived ? (
              <span style={{ marginLeft: 10 }}>(indexes derived in portal)</span>
            ) : null}
          </div>
        </div>
      )}

      <div style={{ marginTop: 16, opacity: 0.85 }}>Example routes (for now these will still show “No dataset loaded”):</div>
      <ul>
        <li>
          <Link to="/portal/e/123">/portal/e/:id</Link>
        </li>
        <li>
          <Link to="/portal/e/ext/EXT-123">/portal/e/ext/:externalId</Link>
        </li>
        <li>
          <Link to="/portal/v/VIEW-123">/portal/v/:id</Link>
        </li>
      </ul>
    </div>
  );
}

import { Link } from 'react-router-dom';

import { usePortalStore } from '../store/usePortalStore';

export default function PortalHomePage() {
  const { datasetMeta } = usePortalStore();

  return (
    <div style={{ maxWidth: 900 }}>
      <h2 style={{ marginTop: 0 }}>Portal</h2>

      {!datasetMeta ? (
        <div style={{ padding: 12, border: '1px solid var(--borderColor, rgba(0,0,0,0.12))', borderRadius: 12 }}>
          <strong>No dataset loaded.</strong>
          <div style={{ marginTop: 8, opacity: 0.85 }}>
            This portal is read-only. Dataset loading will be implemented in Step 2 and Step 3.
          </div>
        </div>
      ) : (
        <div>
          <div style={{ opacity: 0.85 }}>
            Loaded dataset: <strong>{datasetMeta.title ?? 'Unnamed dataset'}</strong>
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

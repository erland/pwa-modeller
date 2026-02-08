import { Link, useParams } from 'react-router-dom';

import { usePortalStore } from '../store/usePortalStore';

export default function PortalViewPage() {
  const { id } = useParams();
  const { datasetMeta } = usePortalStore();

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h2 style={{ marginTop: 0 }}>View</h2>
        <div style={{ opacity: 0.7 }}>{id ? `“${id}”` : '(missing param)'}</div>
      </div>

      {!datasetMeta ? (
        <div
          style={{
            padding: 12,
            border: '1px solid var(--borderColor, rgba(0,0,0,0.12))',
            borderRadius: 12
          }}
        >
          <strong>No dataset loaded.</strong>
          <div style={{ marginTop: 8, opacity: 0.85 }}>
            Once a dataset is loaded, this page will render the view in a read-only diagram viewer.
          </div>
        </div>
      ) : (
        <div>
          {/* Step 6 will render the real diagram */}
          <div style={{ opacity: 0.85 }}>Dataset loaded, but view rendering is not implemented yet.</div>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <Link to="/portal">Back to portal home</Link>
      </div>
    </div>
  );
}

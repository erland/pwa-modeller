import { Link, useParams } from 'react-router-dom';

import { PortalDiagramViewer } from '../components/PortalDiagramViewer';
import { usePortalStore } from '../store/usePortalStore';

export default function PortalViewPage() {
  const { id } = useParams();
  const { datasetMeta, model, status } = usePortalStore();

  const viewId = id ?? '';
  const view = model && id ? model.views[id] : null;

  return (
    <div style={{ maxWidth: 1200 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ marginTop: 0, marginBottom: 4 }}>View</h2>
        <div style={{ opacity: 0.7 }}>{view ? `“${view.name}”` : id ? `“${id}”` : '(missing param)'}</div>
      </div>

      {!datasetMeta || !model ? (
        <div
          style={{
            padding: 12,
            border: '1px solid var(--borderColor, rgba(0,0,0,0.12))',
            borderRadius: 12,
          }}
        >
          <strong>{status === 'loading' ? 'Loading dataset…' : 'No dataset loaded.'}</strong>
          <div style={{ marginTop: 8, opacity: 0.85 }}>
            Go to the portal home to configure a <code>latest.json</code> URL, then return here.
          </div>
        </div>
      ) : !id ? (
        <div
          style={{
            padding: 12,
            border: '1px solid var(--borderColor, rgba(0,0,0,0.12))',
            borderRadius: 12,
          }}
        >
          <strong>Missing view id.</strong>
        </div>
      ) : !view ? (
        <div
          style={{
            padding: 12,
            border: '1px solid var(--borderColor, rgba(0,0,0,0.12))',
            borderRadius: 12,
          }}
        >
          <strong>View not found.</strong>
          <div style={{ marginTop: 8, opacity: 0.85 }}>
            The dataset is loaded, but it does not contain a view with id <code>{viewId}</code>.
          </div>
        </div>
      ) : (
        <div>
          <div style={{ opacity: 0.8, marginBottom: 10 }}>
            <span style={{ fontWeight: 700 }}>{view.name}</span>
            <span style={{ marginLeft: 8 }}>·</span>
            <span style={{ marginLeft: 8, opacity: 0.75 }}>
              Nodes: {Object.keys(view.nodes ?? {}).length} · Connections: {(view.connections ?? []).length}
            </span>
          </div>

          <PortalDiagramViewer model={model} view={view} viewId={viewId} />
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <Link to="/portal">Back to portal home</Link>
      </div>
    </div>
  );
}

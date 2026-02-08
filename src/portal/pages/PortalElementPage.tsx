import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';

import { usePortalStore } from '../store/usePortalStore';

type PortalElementPageProps = { mode: 'internalId' } | { mode: 'externalId' };

export default function PortalElementPage(props: PortalElementPageProps) {
  const params = useParams();
  const { datasetMeta } = usePortalStore();

  const label = useMemo(() => {
    if (props.mode === 'externalId') return params.externalId ?? '';
    return params.id ?? '';
  }, [params, props.mode]);

  const routeTitle = props.mode === 'externalId' ? 'Element (externalId)' : 'Element (id)';

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h2 style={{ marginTop: 0 }}>{routeTitle}</h2>
        <div style={{ opacity: 0.7 }}>{label ? `“${label}”` : '(missing param)'}</div>
      </div>

      {!datasetMeta ? (
        <div style={{ padding: 12, border: '1px solid var(--borderColor, rgba(0,0,0,0.12))', borderRadius: 12 }}>
          <strong>No dataset loaded.</strong>
          <div style={{ marginTop: 8, opacity: 0.85 }}>
            Once a dataset is loaded, this page will render a fact sheet (name, type, properties, relationships, used-in
            views).
          </div>
        </div>
      ) : (
        <div>
          {/* Step 5 will render the real fact sheet */}
          <div style={{ opacity: 0.85 }}>Dataset loaded, but fact sheet rendering is not implemented yet.</div>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <Link to="/portal">Back to portal home</Link>
      </div>
    </div>
  );
}

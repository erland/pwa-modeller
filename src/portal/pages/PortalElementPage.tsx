import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';

import { usePortalStore } from '../store/usePortalStore';
import { getElementFactSheetData, resolveElementIdFromExternalId } from '../indexes/portalIndexes';

type PortalElementPageProps = { mode: 'internalId' } | { mode: 'externalId' };

export default function PortalElementPage(props: PortalElementPageProps) {
  const params = useParams();
  const { datasetMeta, model, indexes } = usePortalStore();

  const label = useMemo(() => {
    if (props.mode === 'externalId') return params.externalId ?? '';
    return params.id ?? '';
  }, [params, props.mode]);

  const routeTitle = props.mode === 'externalId' ? 'Element (externalId)' : 'Element (id)';


  const resolvedElementId = useMemo(() => {
    if (!datasetMeta || !model || !indexes) return null;
    if (props.mode === 'internalId') return params.id ?? null;
    const ext = params.externalId ?? '';
    return ext ? resolveElementIdFromExternalId(indexes, ext) : null;
  }, [datasetMeta, indexes, model, params.externalId, params.id, props.mode]);

  const data = useMemo(() => {
    if (!datasetMeta || !model || !indexes || !resolvedElementId) return null;
    return getElementFactSheetData(model, indexes, resolvedElementId);
  }, [datasetMeta, indexes, model, resolvedElementId]);


  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h2 style={{ marginTop: 0 }}>{routeTitle}</h2>
        <div style={{ opacity: 0.7 }}>{label ? `“${label}”` : '(missing param)'}</div>
      </div>

      {!datasetMeta ? (
        <div style={{ padding: 12, border: '1px solid var(--borderColor, rgba(0,0,0,0.12))', borderRadius: 12 }}>
          <strong>No dataset loaded.</strong>
          <div style={{ marginTop: 6, opacity: 0.8 }}>
            Use <em>Change dataset</em> in the top bar to point the portal to a hosted <code>latest.json</code>.
          </div>
        </div>
      ) : !model || !indexes ? (
        <div style={{ padding: 12, border: '1px solid var(--borderColor, rgba(0,0,0,0.12))', borderRadius: 12 }}>
          <strong>Dataset is loading…</strong>
        </div>
      ) : !resolvedElementId ? (
        <div style={{ padding: 12, border: '1px solid var(--borderColor, rgba(0,0,0,0.12))', borderRadius: 12 }}>
          <strong>Element not found.</strong>
          {props.mode === 'externalId' && (
            <div style={{ marginTop: 6, opacity: 0.85 }}>
              No match for externalId <code>{params.externalId}</code>.
            </div>
          )}
        </div>
      ) : !data ? (
        <div style={{ padding: 12, border: '1px solid var(--borderColor, rgba(0,0,0,0.12))', borderRadius: 12 }}>
          <strong>Element not found in model.</strong>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ padding: 12, border: '1px solid var(--borderColor, rgba(0,0,0,0.12))', borderRadius: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{data.element.name || '(unnamed)'}</div>
                <div style={{ opacity: 0.75, marginTop: 2 }}>
                  <code>{data.element.type}</code>
                  {data.element.layer ? <span> · {data.element.layer}</span> : null}
                </div>
              </div>
              <div style={{ textAlign: 'right', opacity: 0.75 }}>
                <div>
                  <span>id: </span>
                  <code>{data.elementId}</code>
                </div>
                {data.element.externalIds?.length ? (
                  <div style={{ marginTop: 4 }}>
                    <span>externalIds: </span>
                    <code>{data.element.externalIds.length}</code>
                  </div>
                ) : null}
              </div>
            </div>
            {data.element.documentation ? (
              <div style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{data.element.documentation}</div>
            ) : (
              <div style={{ marginTop: 10, opacity: 0.7 }}>(No description)</div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ padding: 12, border: '1px solid var(--borderColor, rgba(0,0,0,0.12))', borderRadius: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Outgoing relations</div>
              {data.relations.outgoing.length ? (
                data.relations.outgoing.map((g) => (
                  <div key={g.relType} style={{ marginBottom: 8 }}>
                    <div style={{ opacity: 0.8 }}>
                      <code>{g.relType}</code> · {g.relIds.length}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ opacity: 0.7 }}>(none)</div>
              )}
            </div>

            <div style={{ padding: 12, border: '1px solid var(--borderColor, rgba(0,0,0,0.12))', borderRadius: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Incoming relations</div>
              {data.relations.incoming.length ? (
                data.relations.incoming.map((g) => (
                  <div key={g.relType} style={{ marginBottom: 8 }}>
                    <div style={{ opacity: 0.8 }}>
                      <code>{g.relType}</code> · {g.relIds.length}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ opacity: 0.7 }}>(none)</div>
              )}
            </div>
          </div>

          <div style={{ padding: 12, border: '1px solid var(--borderColor, rgba(0,0,0,0.12))', borderRadius: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Used in views</div>
            {data.usedInViews.length ? (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {data.usedInViews.map((v) => (
                  <li key={v.id}>
                    <Link to={`/portal/v/${encodeURIComponent(v.id)}`}>{v.name}</Link> <span style={{ opacity: 0.7 }}>({v.kind})</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div style={{ opacity: 0.7 }}>(none)</div>
            )}
          </div>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <Link to="/portal">Back to portal home</Link>
      </div>
    </div>
  );
}

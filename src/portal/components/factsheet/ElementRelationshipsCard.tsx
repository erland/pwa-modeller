import { Link } from 'react-router-dom';

import { Card } from './FactSheetPrimitives';
import { formatRelationshipTypeLabel } from '../../../components/ui/typeLabels';

import type { PortalElementFactSheetData } from '../../indexes/portalIndexes';

export function ElementRelationshipsCard(props: { relations: PortalElementFactSheetData['relations'] }) {
  const { relations } = props;
  return (
    <Card title="Relationships">
      <div style={{ display: 'grid', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Outgoing</div>
          {relations.outgoing.length ? (
            <div style={{ display: 'grid', gap: 8 }}>
              {relations.outgoing.map((g) => (
                <div key={`out-${g.relType}`}>
                  <div style={{ opacity: 0.85, marginBottom: 4 }}>
                    {formatRelationshipTypeLabel({ type: g.relType })} <span style={{ opacity: 0.7 }}>· {g.items.length}</span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {g.items.map((it) => (
                      <li key={it.id} style={{ marginBottom: 4 }}>
                        {it.otherElementId ? (
                          <Link to={`/portal/e/${encodeURIComponent(it.otherElementId)}`}>{it.otherElementName || it.otherElementId}</Link>
                        ) : (
                          <span style={{ opacity: 0.7 }}>(non-element endpoint)</span>
                        )}
                        <span style={{ opacity: 0.75 }}> — </span>
                        <span style={{ opacity: 0.85 }}>
                          {formatRelationshipTypeLabel({ type: it.type })}
                          {it.name ? <span style={{ opacity: 0.85 }}> · {it.name}</span> : null}
                        </span>
                        {it.documentation ? (
                          <div style={{ opacity: 0.75, fontSize: 12, marginTop: 2, whiteSpace: 'pre-wrap' }}>{it.documentation}</div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ opacity: 0.7 }}>(none)</div>
          )}
        </div>

        <div style={{ borderTop: '1px solid var(--borderColor, rgba(0,0,0,0.12))', paddingTop: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Incoming</div>
          {relations.incoming.length ? (
            <div style={{ display: 'grid', gap: 8 }}>
              {relations.incoming.map((g) => (
                <div key={`in-${g.relType}`}>
                  <div style={{ opacity: 0.85, marginBottom: 4 }}>
                    {formatRelationshipTypeLabel({ type: g.relType })} <span style={{ opacity: 0.7 }}>· {g.items.length}</span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {g.items.map((it) => (
                      <li key={it.id} style={{ marginBottom: 4 }}>
                        {it.otherElementId ? (
                          <Link to={`/portal/e/${encodeURIComponent(it.otherElementId)}`}>{it.otherElementName || it.otherElementId}</Link>
                        ) : (
                          <span style={{ opacity: 0.7 }}>(non-element endpoint)</span>
                        )}
                        <span style={{ opacity: 0.75 }}> — </span>
                        <span style={{ opacity: 0.85 }}>
                          {formatRelationshipTypeLabel({ type: it.type })}
                          {it.name ? <span style={{ opacity: 0.85 }}> · {it.name}</span> : null}
                        </span>
                        {it.documentation ? (
                          <div style={{ opacity: 0.75, fontSize: 12, marginTop: 2, whiteSpace: 'pre-wrap' }}>{it.documentation}</div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ opacity: 0.7 }}>(none)</div>
          )}
        </div>
      </div>
    </Card>
  );
}

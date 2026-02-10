import { Link } from 'react-router-dom';

import { Card, SmallButton } from './FactSheetPrimitives';

export function ElementIdentifiersCard(props: {
  elementId: string;
  externalIdKeys: string[];
  onCopy: (kind: string, value: string) => void;
}) {
  const { elementId, externalIdKeys, onCopy } = props;
  return (
    <Card
      title="Identifiers"
      right={
        <SmallButton title="Copy internal id" onClick={() => onCopy('id', elementId)}>
          Copy id
        </SmallButton>
      }
    >
      <div style={{ display: 'grid', gap: 8 }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Internal id</div>
          <code style={{ wordBreak: 'break-all' }}>{elementId}</code>
        </div>

        <div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>External ids</div>
          {externalIdKeys.length ? (
            <div style={{ display: 'grid', gap: 6 }}>
              {externalIdKeys.map((k) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <Link to={`/portal/e/ext/${encodeURIComponent(k)}`} style={{ wordBreak: 'break-all' }}>
                    {k}
                  </Link>
                  <SmallButton title="Copy external id" onClick={() => onCopy('externalId', k)}>
                    Copy
                  </SmallButton>
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

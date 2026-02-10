import { Link } from 'react-router-dom';

import { Card } from './FactSheetPrimitives';

export function ElementUsedInViewsCard(props: { usedInViews: { id: string; name: string; kind: string }[] }) {
  const usedInViews = props.usedInViews ?? [];
  return (
    <Card title="Used in views">
      {usedInViews.length ? (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {usedInViews.map((v) => (
            <li key={v.id}>
              <Link to={`/portal/v/${encodeURIComponent(v.id)}`}>{v.name}</Link>{' '}
              <span style={{ opacity: 0.7 }}>({v.kind})</span>
            </li>
          ))}
        </ul>
      ) : (
        <div style={{ opacity: 0.7 }}>(none)</div>
      )}
    </Card>
  );
}

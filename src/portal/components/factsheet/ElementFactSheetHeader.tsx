import { Link } from 'react-router-dom';

import { Pill, SmallButton } from './FactSheetPrimitives';
import { formatElementTypeLabel } from '../../../components/ui/typeLabels';

export function ElementFactSheetHeader(props: {
  elementDisplayName: string;
  elementType: string;
  elementKind?: string;
  elementLayer?: string;
  internalLink: string;
  bestExternalIdKey: string;
  externalLink: string;
  copied: string | null;
  onCopy: (kind: string, value: string) => void;
}) {
  const {
    elementDisplayName,
    elementType,
    elementKind,
    elementLayer,
    internalLink,
    bestExternalIdKey,
    externalLink,
    copied,
    onCopy,
  } = props;
  const elementTypeLabel = formatElementTypeLabel({ type: elementType });

  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          <Link to="/portal">Portal</Link>
          <span style={{ opacity: 0.6 }}> / </span>
          <span>Element</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>{elementDisplayName}</h2>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Pill>{elementTypeLabel || 'Unknown'}</Pill>
            {elementKind ? <Pill>{elementKind}</Pill> : null}
            {elementLayer ? <Pill>{elementLayer}</Pill> : null}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <SmallButton title="Copy internal link" onClick={() => onCopy('internal-link', internalLink)}>
          Copy link
        </SmallButton>
        {bestExternalIdKey ? (
          <SmallButton title="Copy externalId link" onClick={() => onCopy('external-link', externalLink)}>
            Copy externalId link
          </SmallButton>
        ) : null}
        {copied ? <span style={{ fontSize: 12, opacity: 0.75 }}>{copied === 'copy-failed' ? 'Copy failed' : 'Copied'}</span> : null}
      </div>
    </div>
  );
}

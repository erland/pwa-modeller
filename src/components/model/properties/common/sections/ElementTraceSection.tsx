import type { Model } from '../../../../../domain';
import type { Selection } from '../../../selection';
import { getElementLabel } from '../../utils';
import type { TraceDirection } from '../hooks/useRelationshipTrace';
import { relationshipTypeLabel } from '../utils/relationshipLabels';

type Props = {
  model: Model;
  traceDirection: TraceDirection;
  setTraceDirection: (direction: TraceDirection) => void;
  traceDepth: number;
  setTraceDepth: (depth: number) => void;
  traceSteps: Array<{ depth: number; fromId: string; toId: string; relationship: { id: string; name?: string } }>;
  onSelect?: (selection: Selection) => void;
};

export function ElementTraceSection({
  model,
  traceDirection,
  setTraceDirection,
  traceDepth,
  setTraceDepth,
  traceSteps,
  onSelect,
}: Props) {
  return (
    <div style={{ marginTop: 14 }}>
      <p className="panelHint">Trace</p>
      <div className="propertiesGrid">
        <div className="propertiesRow">
          <div className="propertiesKey">Direction</div>
          <div className="propertiesValue" style={{ fontWeight: 400 }}>
            <select
              className="selectInput"
              aria-label="Trace direction"
              value={traceDirection}
              onChange={(e) => setTraceDirection(e.target.value as TraceDirection)}
            >
              <option value="both">Both</option>
              <option value="outgoing">Outgoing</option>
              <option value="incoming">Incoming</option>
            </select>
          </div>
        </div>

        <div className="propertiesRow">
          <div className="propertiesKey">Depth</div>
          <div className="propertiesValue" style={{ fontWeight: 400 }}>
            <select
              className="selectInput"
              aria-label="Trace depth"
              value={String(traceDepth)}
              onChange={(e) => {
                const n = Number(e.target.value);
                setTraceDepth(Number.isFinite(n) && n >= 1 && n <= 5 ? n : 1);
              }}
            >
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
            </select>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
        {traceSteps.length === 0 ? (
          <div style={{ opacity: 0.7 }}>No trace results.</div>
        ) : (
          traceSteps.map((s, idx) => {
            const relLabel = `${relationshipTypeLabel(s.relationship)}${s.relationship.name ? ` — ${s.relationship.name}` : ''}`;
            const fromName = getElementLabel(model, s.fromId);
            const toName = getElementLabel(model, s.toId);
            return (
              <div
                key={`${s.relationship.id}_${idx}`}
                style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}
              >
                <span style={{ opacity: 0.7 }}>d{s.depth}</span>
                <button
                  type="button"
                  className="miniButton"
                  aria-label={`Select relationship ${relLabel}`}
                  onClick={() => onSelect?.({ kind: 'relationship', relationshipId: s.relationship.id })}
                >
                  {relLabel}
                </button>
                <span style={{ opacity: 0.7 }}>:</span>
                <button
                  type="button"
                  className="miniButton"
                  aria-label={`Select element ${fromName}`}
                  onClick={() => onSelect?.({ kind: 'element', elementId: s.fromId })}
                >
                  {fromName}
                </button>
                <span style={{ opacity: 0.7 }}>→</span>
                <button
                  type="button"
                  className="miniButton"
                  aria-label={`Select element ${toName}`}
                  onClick={() => onSelect?.({ kind: 'element', elementId: s.toId })}
                >
                  {toName}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

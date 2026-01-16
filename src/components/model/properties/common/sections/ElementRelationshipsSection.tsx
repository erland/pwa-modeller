import type { Model, Relationship } from '../../../../../domain';
import type { Selection } from '../../../selection';
import { getElementLabel } from '../../utils';
import type { UsedInView } from '../hooks/useUsedInViews';
import { relationshipTypeLabel } from '../utils/relationshipLabels';

type Props = {
  model: Model;
  elementId: string;
  kind: 'archimate' | 'uml' | 'bpmn';
  usedInViews: UsedInView[];
  outgoing: Relationship[];
  incoming: Relationship[];
  onSelect?: (selection: Selection) => void;
  onNewRelationship: () => void;
};

export function ElementRelationshipsSection({
  model,
  elementId,
  kind,
  usedInViews,
  outgoing,
  incoming,
  onSelect,
  onNewRelationship,
}: Props) {
  const canCreateRelationship = kind === 'archimate' && Object.keys(model.elements).length >= 2;

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <p className="panelHint" style={{ margin: 0 }}>
          Relationships
        </p>
        <button
          type="button"
          className="miniButton"
          disabled={!canCreateRelationship}
          title={
            kind !== 'archimate'
              ? 'Relationship creation from this panel is ArchiMate-only (for now).'
              : canCreateRelationship
                ? 'Create relationship'
                : 'Create at least two elements first'
          }
          onClick={onNewRelationship}
        >
          New relationship…
        </button>
      </div>
      <div className="propertiesGrid">
        <div className="propertiesRow">
          <div className="propertiesKey">Used in views</div>
          <div className="propertiesValue" style={{ fontWeight: 400 }}>
            {usedInViews.length === 0 ? (
              <span style={{ opacity: 0.7 }}>None</span>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {usedInViews.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className="miniButton"
                    aria-label={`Select view ${v.name}`}
                    onClick={() => onSelect?.({ kind: 'viewNode', viewId: v.id, elementId })}
                  >
                    {v.name}
                    {v.count > 1 ? ` (${v.count})` : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="propertiesRow">
          <div className="propertiesKey">Outgoing</div>
          <div className="propertiesValue" style={{ fontWeight: 400 }}>
            {outgoing.length === 0 ? (
              <span style={{ opacity: 0.7 }}>None</span>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                {outgoing.map((r) => {
                  const targetSelection: Selection | null = r.targetElementId
                    ? { kind: 'element', elementId: r.targetElementId }
                    : r.targetConnectorId
                      ? { kind: 'connector', connectorId: r.targetConnectorId }
                      : null;

                  const targetName = r.targetElementId
                    ? getElementLabel(model, r.targetElementId)
                    : r.targetConnectorId
                      ? (() => {
                          const c = model.connectors?.[r.targetConnectorId];
                          const typeLabel = c?.type ?? 'Connector';
                          return c?.name ? `${c.name} (${typeLabel})` : typeLabel;
                        })()
                      : '(missing endpoint)';
                  const relLabel = `${relationshipTypeLabel(r)}${r.name ? ` — ${r.name}` : ''}`;
                  return (
                    <div key={r.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      <button
                        type="button"
                        className="miniButton"
                        aria-label={`Select relationship ${relLabel}`}
                        onClick={() => onSelect?.({ kind: 'relationship', relationshipId: r.id })}
                      >
                        {relLabel}
                      </button>
                      <span style={{ opacity: 0.7 }}>→</span>
                      {targetSelection ? (
                        <button
                          type="button"
                          className="miniButton"
                          aria-label={`Select target ${targetName}`}
                          onClick={() => onSelect?.(targetSelection)}
                        >
                          {targetName}
                        </button>
                      ) : (
                        <span style={{ opacity: 0.8 }}>{targetName}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="propertiesRow">
          <div className="propertiesKey">Incoming</div>
          <div className="propertiesValue" style={{ fontWeight: 400 }}>
            {incoming.length === 0 ? (
              <span style={{ opacity: 0.7 }}>None</span>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                {incoming.map((r) => {
                  const sourceSelection: Selection | null = r.sourceElementId
                    ? { kind: 'element', elementId: r.sourceElementId }
                    : r.sourceConnectorId
                      ? { kind: 'connector', connectorId: r.sourceConnectorId }
                      : null;

                  const sourceName = r.sourceElementId
                    ? getElementLabel(model, r.sourceElementId)
                    : r.sourceConnectorId
                      ? (() => {
                          const c = model.connectors?.[r.sourceConnectorId];
                          const typeLabel = c?.type ?? 'Connector';
                          return c?.name ? `${c.name} (${typeLabel})` : typeLabel;
                        })()
                      : '(missing endpoint)';
                  const relLabel = `${relationshipTypeLabel(r)}${r.name ? ` — ${r.name}` : ''}`;
                  return (
                    <div key={r.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      {sourceSelection ? (
                        <button
                          type="button"
                          className="miniButton"
                          aria-label={`Select source ${sourceName}`}
                          onClick={() => onSelect?.(sourceSelection)}
                        >
                          {sourceName}
                        </button>
                      ) : (
                        <span style={{ opacity: 0.8 }}>{sourceName}</span>
                      )}
                      <span style={{ opacity: 0.7 }}>→</span>
                      <button
                        type="button"
                        className="miniButton"
                        aria-label={`Select relationship ${relLabel}`}
                        onClick={() => onSelect?.({ kind: 'relationship', relationshipId: r.id })}
                      >
                        {relLabel}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

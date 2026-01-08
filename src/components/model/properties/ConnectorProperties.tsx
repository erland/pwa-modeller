import type { Model, Relationship } from '../../../domain';
import type { Selection } from '../selection';
import type { ModelActions } from './actions';
import { NameEditorRow } from './editors/NameEditorRow';
import { DocumentationEditorRow } from './editors/DocumentationEditorRow';
import { PropertyRow } from './editors/PropertyRow';
import { ExternalIdsSection } from './sections/ExternalIdsSection';
import { TaggedValuesSection } from './sections/TaggedValuesSection';

type Props = {
  model: Model;
  connectorId: string;
  actions: ModelActions;
  onSelect?: (selection: Selection) => void;
};

function otherEndpointLabel(model: Model, rel: Relationship, selfConnectorId: string): { label: string; selection?: Selection } {
  const isSource = rel.sourceConnectorId === selfConnectorId;
  const otherIsElement = isSource ? !!rel.targetElementId : !!rel.sourceElementId;
  const otherIsConnector = isSource ? !!rel.targetConnectorId : !!rel.sourceConnectorId;

  if (otherIsElement) {
    const otherElementId = (isSource ? rel.targetElementId : rel.sourceElementId) as string;
    const el = model.elements[otherElementId];
    const name = el ? (el.name || '(unnamed)') : otherElementId;
    return { label: name, selection: { kind: 'element', elementId: otherElementId } };
  }

  if (otherIsConnector) {
    const otherConnectorId = (isSource ? rel.targetConnectorId : rel.sourceConnectorId) as string;
    const c = model.connectors?.[otherConnectorId];
    const typeLabel = c?.type ?? 'Connector';
    const name = c?.name ? `${c.name} (${typeLabel})` : typeLabel;
    return { label: name, selection: { kind: 'connector', connectorId: otherConnectorId } };
  }

  // Should not happen for a valid model (Step 4 invariants), but keep UI resilient.
  return { label: '(missing endpoint)' };
}

export function ConnectorProperties({ model, connectorId, actions, onSelect }: Props) {
  const conn = model.connectors?.[connectorId];
  if (!conn) return <p className="panelHint">Connector not found.</p>;

  const relationships = Object.values(model.relationships)
    .filter((r) => r.sourceConnectorId === connectorId || r.targetConnectorId === connectorId)
    .sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id, undefined, { sensitivity: 'base' }));

  const usedInViews = Object.values(model.views)
    .filter((v) => v.layout && v.layout.nodes.some((n) => n.connectorId === connectorId))
    .map((v) => ({ id: v.id, name: v.name }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  return (
    <div>
      <p className="panelHint">Connector</p>

      <div className="propertiesGrid">
        <PropertyRow label="Type">{conn.type}</PropertyRow>
        <NameEditorRow
          ariaLabel="Connector property name"
          value={conn.name}
          onChange={(next) => actions.updateConnector(conn.id, { name: next })}
        />
        <DocumentationEditorRow
          ariaLabel="Connector property documentation"
          value={conn.documentation}
          onChange={(next) => actions.updateConnector(conn.id, { documentation: next })}
        />

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
                    onClick={() => onSelect?.({ kind: 'view', viewId: v.id })}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <h3 className="crudSubtitle">Relationships</h3>
        {relationships.length === 0 ? (
          <p className="crudHint">No relationships connected to this connector.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {relationships.map((rel) => {
              const outgoing = rel.sourceConnectorId === connectorId;
              const dir = outgoing ? 'Outgoing' : 'Incoming';
              const other = otherEndpointLabel(model, rel, connectorId);
              const relLabel = rel.name ? `${rel.name} (${rel.type})` : rel.type;
              return (
                <div key={rel.id} className="crudRow" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ minWidth: 74, opacity: 0.8 }}>{dir}</span>
                  <button
                    type="button"
                    className="miniButton"
                    aria-label={`Select relationship ${relLabel}`}
                    onClick={() => onSelect?.({ kind: 'relationship', relationshipId: rel.id })}
                  >
                    {relLabel}
                  </button>
                  <span style={{ opacity: 0.65 }}>↔</span>
                  {other.selection ? (
                    <button
                      type="button"
                      className="miniButton"
                      aria-label={`Select other endpoint ${other.label}`}
                      onClick={() => onSelect?.(other.selection!)}
                    >
                      {other.label}
                    </button>
                  ) : (
                    <span style={{ opacity: 0.8 }}>{other.label}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ExternalIdsSection externalIds={conn.externalIds} />

      <TaggedValuesSection
        taggedValues={conn.taggedValues}
        onChange={(next) => actions.updateConnector(conn.id, { taggedValues: next })}
        dialogTitle={`Connector tagged values — ${conn.name || conn.id}`}
      />

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          type="button"
          className="shellButton"
          onClick={() => {
            const count = relationships.length;
            const ok = window.confirm(
              count > 0
                ? `Delete this connector and ${count} related relationship${count === 1 ? '' : 's'}?`
                : 'Delete this connector?'
            );
            if (!ok) return;
            actions.deleteConnector(conn.id);
            onSelect?.({ kind: 'model' });
          }}
        >
          Delete connector
        </button>
      </div>
    </div>
  );
}

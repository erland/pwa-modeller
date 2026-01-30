import { useMemo } from 'react';
import type { ReactNode } from 'react';

import type {
  Element,
  Model,
  Relationship,
  RelationshipType,
  ViewConnectionAnchorSide,
  ViewConnectionRouteKind,
} from '../../../../domain';
import { getRelationshipTypeLabel, kindFromTypeId } from '../../../../domain';

import type { Selection } from '../../selection';
import { formatElementTypeLabel } from '../../../ui/typeLabels';
import type { ModelActions } from '../actions';
import { NameEditorRow } from '../editors/NameEditorRow';
import { DocumentationEditorRow } from '../editors/DocumentationEditorRow';
import { PropertyRow } from '../editors/PropertyRow';
import { ExternalIdsSection } from '../sections/ExternalIdsSection';
import { TaggedValuesSection } from '../sections/TaggedValuesSection';

type Props = {
  model: Model;
  relationship: Relationship;
  relationshipTypeOptions: RelationshipType[];
  elementOptions: Element[];
  /** Optional: when the relationship is selected from within a view, this enables view-specific connection props. */
  viewId?: string;
  actions: ModelActions;
  onSelect?: (selection: Selection) => void;
  /** Extra controls to render inside the Type field (e.g. ArchiMate filtering toggles and warnings). */
  typeExtra?: ReactNode;
  /** Notation-specific fields (e.g. UML stereotype/multiplicity, ArchiMate accessType). */
  notationRows?: ReactNode;
};

export function CommonRelationshipProperties({
  model,
  relationship: rel,
  relationshipTypeOptions,
  elementOptions,
  viewId,
  actions,
  onSelect,
  typeExtra,
  notationRows,
}: Props) {
  const relKind = kindFromTypeId(rel.type);


  const elementOptionLabel = (e: Element) => {
    const typeLabel = formatElementTypeLabel(e);
    return `${e.name} (${typeLabel})`;
  };

  const usedInViews = useMemo(() => {
    return Object.values(model.views)
      .filter((v) => Array.isArray(v.connections) && v.connections.some((c) => c.relationshipId === rel.id))
      .map((v) => {
        const count = v.connections ? v.connections.filter((c) => c.relationshipId === rel.id).length : 0;
        return { id: v.id, name: v.name, count };
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [model, rel.id]);

  const selectedView = viewId ? model.views[viewId] : undefined;
  const selectedConnection = selectedView?.connections?.find((c) => c.relationshipId === rel.id);
  const routingKind: ViewConnectionRouteKind | null = selectedConnection?.route?.kind ?? null;
  const sourceAnchor: ViewConnectionAnchorSide = (selectedConnection?.sourceAnchor ?? 'auto') as ViewConnectionAnchorSide;
  const targetAnchor: ViewConnectionAnchorSide = (selectedConnection?.targetAnchor ?? 'auto') as ViewConnectionAnchorSide;

  const sourceName = rel.sourceElementId ? model.elements[rel.sourceElementId]?.name ?? rel.sourceElementId : '—';
  const targetName = rel.targetElementId ? model.elements[rel.targetElementId]?.name ?? rel.targetElementId : '—';

  return (
    <div>
      <p className="panelHint">Relationship</p>

      <div className="propertiesGrid">
        <NameEditorRow
          ariaLabel="Relationship property name"
          required
          value={rel.name}
          onChange={(next) => actions.updateRelationship(rel.id, { name: next ?? '' })}
        />

        <PropertyRow label="Type">
          <div style={{ display: 'grid', gap: 6 }}>
            <select
              className="selectInput"
              aria-label="Relationship property type"
              value={rel.type}
              onChange={(e) => {
                const nextType = e.target.value as RelationshipType;
                actions.updateRelationship(rel.id, { type: nextType });
              }}
            >
              {relationshipTypeOptions.map((t) => (
                <option key={t} value={t}>
                  {getRelationshipTypeLabel(t) || t}
                </option>
              ))}
            </select>
            {typeExtra}
          </div>
        </PropertyRow>

        {rel.type === 'Unknown' ? (
          <div className="propertiesRow">
            <div className="propertiesKey">Original type</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <div style={{ opacity: 0.9 }}>
                {rel.unknownType?.ns ? `${rel.unknownType.ns}:` : ''}
                {rel.unknownType?.name ?? 'Unknown'}
              </div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                Map this relationship to a known type using the Type dropdown.
              </div>
            </div>
          </div>
        ) : null}

        <DocumentationEditorRow
          label="Documentation"
          ariaLabel="Relationship property documentation"
          value={rel.documentation}
          onChange={(next) => actions.updateRelationship(rel.id, { documentation: next })}
        />

        {notationRows}

        <PropertyRow label="From">
          <div style={{ display: 'grid', gap: 6 }}>
            <select
              className="selectInput"
              aria-label="Relationship property source"
              value={rel.sourceElementId ?? ''}
              onChange={(e) => actions.updateRelationship(rel.id, { sourceElementId: e.target.value })}
            >
              {elementOptions.map((e) => (
                <option key={e.id} value={e.id}>
                  {elementOptionLabel(e)}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Current: {sourceName}</div>
          </div>
        </PropertyRow>

        <PropertyRow label="To">
          <div style={{ display: 'grid', gap: 6 }}>
            <select
              className="selectInput"
              aria-label="Relationship property target"
              value={rel.targetElementId ?? ''}
              onChange={(e) => actions.updateRelationship(rel.id, { targetElementId: e.target.value })}
            >
              {elementOptions.map((e) => (
                <option key={e.id} value={e.id}>
                  {elementOptionLabel(e)}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Current: {targetName}</div>
          </div>
        </PropertyRow>

        {selectedConnection && viewId ? (
          <div className="propertiesRow">
            <div className="propertiesKey">Routing</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <select
                className="selectInput"
                aria-label="View connection routing"
                value={routingKind ?? 'auto'}
                onChange={(e) =>
                  actions.setViewConnectionRoute(viewId, selectedConnection.id, e.target.value as ViewConnectionRouteKind)
                }
              >
                <option value="auto">Auto</option>
                <option value="polyline">Polyline</option>
                <option value="orthogonal">Orthogonal</option>
              </select>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                Applies to this relationship instance in the selected view.
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>From anchor</div>
                  <select
                    className="selectInput"
                    aria-label="View connection source anchor"
                    value={sourceAnchor}
                    onChange={(e) => {
                      const v = e.target.value as ViewConnectionAnchorSide;
                      actions.setViewConnectionEndpointAnchors(viewId, selectedConnection.id, {
                        sourceAnchor: v === 'auto' ? undefined : v,
                        targetAnchor: targetAnchor === 'auto' ? undefined : targetAnchor,
                      });
                    }}
                  >
                    <option value="auto">Auto</option>
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                    <option value="top">Top</option>
                    <option value="bottom">Bottom</option>
                  </select>
                </div>

                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>To anchor</div>
                  <select
                    className="selectInput"
                    aria-label="View connection target anchor"
                    value={targetAnchor}
                    onChange={(e) => {
                      const v = e.target.value as ViewConnectionAnchorSide;
                      actions.setViewConnectionEndpointAnchors(viewId, selectedConnection.id, {
                        sourceAnchor: sourceAnchor === 'auto' ? undefined : sourceAnchor,
                        targetAnchor: v === 'auto' ? undefined : v,
                      });
                    }}
                  >
                    <option value="auto">Auto</option>
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                    <option value="top">Top</option>
                    <option value="bottom">Bottom</option>
                  </select>
                </div>
              </div>

              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                Anchor overrides are view-only and influence the auto-router. Auto Layout resets these.
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {usedInViews.length ? (
        <div style={{ marginTop: 12 }}>
          <div className="panelHint" style={{ marginBottom: 6 }}>
            Used in views
          </div>
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
                {v.count > 1 ? ` (${v.count})` : ''}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <ExternalIdsSection externalIds={rel.externalIds} />

      <TaggedValuesSection
        taggedValues={rel.taggedValues}
        onChange={(next) => actions.updateRelationship(rel.id, { taggedValues: next })}
        dialogTitle={`Relationship tagged values — ${rel.name || rel.id}`}
      />

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          type="button"
          className="shellButton"
          onClick={() => {
            const ok = window.confirm('Delete this relationship?');
            if (!ok) return;
            actions.deleteRelationship(rel.id);
          }}
        >
          Delete relationship
        </button>
      </div>

      <div style={{ marginTop: 12, fontSize: 12, opacity: 0.75 }}>
        Kind: <span style={{ opacity: 0.9 }}>{relKind}</span>
      </div>
    </div>
  );
}

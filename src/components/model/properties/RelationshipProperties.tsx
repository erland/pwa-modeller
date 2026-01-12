import { useEffect, useMemo, useState } from 'react';

import type { AccessType, Element, Model, RelationshipType, ViewConnectionRouteKind } from '../../../domain';
import { RELATIONSHIP_TYPES } from '../../../domain';
import { getAllowedRelationshipTypes, initRelationshipValidationMatrixFromBundledTable, validateRelationship } from '../../../domain/config/archimatePalette';

import type { Selection } from '../selection';
import type { ModelActions } from './actions';
import { NameEditorRow } from './editors/NameEditorRow';
import { DocumentationEditorRow } from './editors/DocumentationEditorRow';
import { PropertyRow } from './editors/PropertyRow';
import { ExternalIdsSection } from './sections/ExternalIdsSection';
import { TaggedValuesSection } from './sections/TaggedValuesSection';
import { useModelStore } from '../../../store';

const ACCESS_TYPES: AccessType[] = ['Access', 'Read', 'Write', 'ReadWrite'];

type Props = {
  model: Model;
  relationshipId: string;
  /** Optional: when the relationship is selected from within a view, this enables view-specific connection props. */
  viewId?: string;
  actions: ModelActions;
  onSelect?: (selection: Selection) => void;
};

export function RelationshipProperties({ model, relationshipId, viewId, actions, onSelect }: Props) {
  
  const { relationshipValidationMode } = useModelStore((s) => ({ relationshipValidationMode: s.relationshipValidationMode }));

  const [matrixLoadTick, setMatrixLoadTick] = useState(0);

  useEffect(() => {
    if (relationshipValidationMode === 'minimal') return;
    let cancelled = false;
    void initRelationshipValidationMatrixFromBundledTable().then(() => {
      if (!cancelled) setMatrixLoadTick((t) => t + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [relationshipValidationMode]);
  const rel = model.relationships[relationshipId];
  const [showAllRelationshipTypes, setShowAllRelationshipTypes] = useState(false);
  useEffect(() => {
    // Reset per selection to avoid surprising carry-over when clicking between relationships.
    setShowAllRelationshipTypes(false);
  }, [relationshipId]);

  const sourceElement = rel?.sourceElementId ? model.elements[rel.sourceElementId] : undefined;
  const targetElement = rel?.targetElementId ? model.elements[rel.targetElementId] : undefined;

  const sourceType = sourceElement?.type;
  const targetType = targetElement?.type;
  const relType = rel?.type;
  const relIsUnknown = relType === 'Unknown';

  const allowedRelationshipTypes = useMemo(() => {
    // Dependency tick to recompute when the relationship matrix loads/changes.
    void matrixLoadTick;
    if (!sourceType || !targetType) return RELATIONSHIP_TYPES as RelationshipType[];
    const allowed = getAllowedRelationshipTypes(sourceType, targetType, relationshipValidationMode);
    return (allowed.length > 0 ? allowed : (RELATIONSHIP_TYPES as RelationshipType[])) as RelationshipType[];
  }, [sourceType, targetType, relationshipValidationMode, matrixLoadTick]);

  const relationshipRuleWarning = useMemo(() => {
    // Dependency tick to recompute when the relationship matrix loads/changes.
    void matrixLoadTick;
    if (!rel || !sourceType || !targetType) return null;
    if (relIsUnknown) return null;
    const res = validateRelationship(sourceType, targetType, relType as RelationshipType, relationshipValidationMode);
    return res.allowed ? null : res.reason;
  }, [rel, sourceType, targetType, relType, relIsUnknown, relationshipValidationMode, matrixLoadTick]);

  const relationshipTypeOptions = useMemo(() => {
    const base: RelationshipType[] = showAllRelationshipTypes ? RELATIONSHIP_TYPES : allowedRelationshipTypes;
    const list: RelationshipType[] = [...base];
    const seen = new Set(list);

    // Keep current value visible even if it's not in the filtered set.
    if (relIsUnknown) {
      // When imported as unknown, allow mapping to known types while keeping the original choice.
      return ['Unknown', ...list.filter((t) => t !== 'Unknown')];
    }

    if (relType && !seen.has(relType)) return [relType, ...list];
    return list;
  }, [showAllRelationshipTypes, allowedRelationshipTypes, relType, relIsUnknown]);

  if (!rel) return <p className="panelHint">Relationship not found.</p>;
  const elementOptions = Object.values(model.elements)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  const sourceId = rel.sourceElementId ?? rel.sourceConnectorId ?? '';
  const targetId = rel.targetElementId ?? rel.targetConnectorId ?? '';
  const sourceName = (rel.sourceElementId ? model.elements[rel.sourceElementId]?.name : undefined) ?? sourceId;
  const targetName = (rel.targetElementId ? model.elements[rel.targetElementId]?.name : undefined) ?? targetId;

  const elementOptionLabel = (e: Element): string => {
    const typeLabel =
      e.type === 'Unknown'
        ? e.unknownType?.name
          ? `Unknown: ${e.unknownType.name}`
          : 'Unknown'
        : e.type;
    return `${e.name} (${typeLabel})`;
  };

  const usedInViews = Object.values(model.views)
    .filter((v) => Array.isArray(v.connections) && v.connections.some((c) => c.relationshipId === rel.id))
    .map((v) => {
      const count = v.connections ? v.connections.filter((c) => c.relationshipId === rel.id).length : 0;
      return { id: v.id, name: v.name, count };
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  const selectedView = viewId ? model.views[viewId] : undefined;
  const selectedConnection = selectedView?.connections?.find((c) => c.relationshipId === rel.id);
  const routingKind: ViewConnectionRouteKind | null = selectedConnection?.route?.kind ?? null;

  return (
    <div>
      <p className="panelHint">Relationship</p>
      <div className="propertiesGrid">
        <PropertyRow label="Type">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <select
              className="selectInput"
              aria-label="Relationship property type"
              value={rel.type}
              onChange={(e) => actions.updateRelationship(rel.id, { type: e.target.value as RelationshipType })}
            >
              {relationshipTypeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.85 }}>
              <input
                type="checkbox"
                aria-label="Show all relationship types"
                checked={showAllRelationshipTypes}
                onChange={(e) => setShowAllRelationshipTypes(e.target.checked)}
              />
              Show all relationship types
            </label>

            {!showAllRelationshipTypes && sourceElement && targetElement ? (
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                Showing types allowed for <span style={{ opacity: 0.95 }}>{sourceElement.type}</span> →{' '}
                <span style={{ opacity: 0.95 }}>{targetElement.type}</span>.
              </div>
            ) : null}

            {relationshipRuleWarning ? (
              <div className="panelHint" style={{ color: '#ffb3b3', opacity: 0.95 }}>
                {relationshipRuleWarning}
              </div>
            ) : null}
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

        {rel.type === 'Access' && (
          <div className="propertiesRow">
            <div className="propertiesKey">Access type</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <select
                className="selectInput"
                aria-label="Relationship property access type"
                value={rel.attrs?.accessType ?? 'Access'}
                onChange={(e) =>
                  actions.updateRelationship(rel.id, {
                    attrs: { ...(rel.attrs ?? {}), accessType: e.target.value as AccessType }
                  })
                }
              >
                {ACCESS_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                Access specifies whether data is read, written, or both.
              </div>
            </div>
          </div>
        )}

        {rel.type === 'Influence' && (
          <div className="propertiesRow">
            <div className="propertiesKey">Strength</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <input
                className="textInput"
                aria-label="Relationship property influence strength"
                placeholder="e.g. +, ++, -, --, 5"
                value={rel.attrs?.influenceStrength ?? ''}
                onChange={(e) =>
                  actions.updateRelationship(rel.id, {
                    attrs: { ...(rel.attrs ?? {}), influenceStrength: e.target.value || undefined }
                  })
                }
              />
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                Optional: use a sign or scale that matches your organization.
              </div>
            </div>
          </div>
        )}

        {rel.type === 'Association' && (
          <div className="propertiesRow">
            <div className="propertiesKey">Directed</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  aria-label="Relationship property association directed"
                  checked={!!rel.attrs?.isDirected}
                  onChange={(e) =>
                    actions.updateRelationship(rel.id, {
                      attrs: { ...(rel.attrs ?? {}), isDirected: e.target.checked ? true : undefined }
                    })
                  }
                />
                Directed association
              </label>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                When enabled, the association is shown as an arrow from source to target.
              </div>
            </div>
          </div>
        )}
        <PropertyRow label="From">
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
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>Current: {sourceName}</div>
        </PropertyRow>
        <PropertyRow label="To">
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
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>Current: {targetName}</div>
        </PropertyRow>

        {selectedConnection && viewId ? (
          <PropertyRow label="Routing">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <select
                className="selectInput"
                aria-label="Relationship property routing"
                value={routingKind ?? 'orthogonal'}
                onChange={(e) =>
                  actions.setViewConnectionRoute(
                    viewId,
                    selectedConnection.id,
                    e.target.value as ViewConnectionRouteKind
                  )
                }
              >
                <option value="orthogonal">Orthogonal</option>
                <option value="straight">Straight</option>
              </select>
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                Routing is stored per view.
              </div>
            </div>
          </PropertyRow>
        ) : null}
        <NameEditorRow
          ariaLabel="Relationship property name"
          value={rel.name}
          onChange={(next) => actions.updateRelationship(rel.id, { name: next })}
        />
        <DocumentationEditorRow
          label="Documentation"
          ariaLabel="Relationship property documentation"
          value={rel.documentation}
          onChange={(next) => actions.updateRelationship(rel.id, { documentation: next })}
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
                    {v.count > 1 ? ` (${v.count})` : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

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
    </div>
  );
}
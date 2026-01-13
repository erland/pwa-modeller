import { useEffect, useMemo, useState } from 'react';

import type { AccessType, Element, Model, RelationshipType, ViewConnectionRouteKind } from '../../../domain';
import { getRelationshipTypeLabel, getRelationshipTypesForKind } from '../../../domain';
import { getAllowedRelationshipTypes, initRelationshipValidationMatrixFromBundledTable, validateRelationship } from '../../../domain/config/archimatePalette';
import { getNotation } from '../../../notations/registry';

import type { Selection } from '../selection';
import type { ModelActions } from './actions';
import { NameEditorRow } from './editors/NameEditorRow';
import { DocumentationEditorRow } from './editors/DocumentationEditorRow';
import { PropertyRow } from './editors/PropertyRow';
import { ExternalIdsSection } from './sections/ExternalIdsSection';
import { TaggedValuesSection } from './sections/TaggedValuesSection';
import { useModelStore } from '../../../store';

const ACCESS_TYPES: AccessType[] = ['Access', 'Read', 'Write', 'ReadWrite'];

function inferKindFromType(type: string | undefined): 'archimate' | 'uml' | 'bpmn' {
  const t = (type ?? '').trim();
  if (t.startsWith('uml.')) return 'uml';
  if (t.startsWith('bpmn.')) return 'bpmn';
  return 'archimate';
}


function asTrimmedOrUndef(v: string): string | undefined {
  const s = v.trim();
  return s.length ? s : undefined;
}

function pruneAttrs(obj: Record<string, unknown>): Record<string, unknown> | undefined {
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    next[k] = v;
  }
  return Object.keys(next).length ? next : undefined;
}

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

  const rel = model.relationships[relationshipId];
  const relKind = rel ? (rel.kind ?? inferKindFromType(rel.type as unknown as string)) : 'archimate';
  const notation = getNotation(relKind);

  const [matrixLoadTick, setMatrixLoadTick] = useState(0);

  useEffect(() => {
    if (relKind !== 'archimate') return;
    if (relationshipValidationMode === 'minimal') return;
    let cancelled = false;
    void initRelationshipValidationMatrixFromBundledTable().then(() => {
      if (!cancelled) setMatrixLoadTick((t) => t + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [relationshipValidationMode, relKind]);

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

    const allForKind = getRelationshipTypesForKind(relKind) as RelationshipType[];

    if (relKind !== 'archimate') {
      return allForKind;
    }

    if (!sourceType || !targetType) return allForKind;
    const allowed = getAllowedRelationshipTypes(sourceType, targetType, relationshipValidationMode);
    return (allowed.length > 0 ? allowed : allForKind) as RelationshipType[];
  }, [sourceType, targetType, relationshipValidationMode, matrixLoadTick, relKind]);

  const relationshipRuleWarning = useMemo(() => {
    // Dependency tick to recompute when the relationship matrix loads/changes.
    void matrixLoadTick;
    if (!rel || !sourceType || !targetType) return null;
    if (relIsUnknown) return null;

    if (relKind === 'archimate') {
      const res = validateRelationship(sourceType, targetType, relType as RelationshipType, relationshipValidationMode);
      return res.allowed ? null : res.reason;
    }

    const res = notation.canCreateRelationship({
      relationshipType: relType as unknown as string,
      sourceType,
      targetType,
      mode: relationshipValidationMode,
    });
    return res.allowed ? null : (res.reason ?? 'This relationship is not allowed for the selected types.');
  }, [rel, sourceType, targetType, relType, relIsUnknown, relationshipValidationMode, matrixLoadTick, relKind, notation]);

  const relationshipTypeOptions = useMemo(() => {
    const allForKind = getRelationshipTypesForKind(relKind) as RelationshipType[];

    const base: RelationshipType[] = relKind === 'archimate'
      ? (showAllRelationshipTypes ? allForKind : allowedRelationshipTypes)
      : allForKind;

    const list: RelationshipType[] = [...base];
    const seen = new Set(list);

    // Keep current value visible even if it's not in the filtered set.
    if (relIsUnknown) {
      return ['Unknown', ...list.filter((t) => t !== 'Unknown')];
    }

    if (relType && !seen.has(relType)) return [relType, ...list];
    return list;
  }, [showAllRelationshipTypes, allowedRelationshipTypes, relType, relIsUnknown, relKind]);

  if (!rel) return <p className="panelHint">Relationship not found.</p>;

  const attrsObj: Record<string, unknown> =
    rel.attrs && typeof rel.attrs === 'object' ? (rel.attrs as Record<string, unknown>) : {};
  const accessType = typeof attrsObj.accessType === 'string' ? (attrsObj.accessType as string) : undefined;
  const influenceStrength =
    typeof attrsObj.influenceStrength === 'string' ? (attrsObj.influenceStrength as string) : undefined;
  const isDirected = typeof attrsObj.isDirected === 'boolean' ? (attrsObj.isDirected as boolean) : false;

  // UML attrs (v1)
  const umlStereotype = typeof attrsObj.stereotype === 'string' ? (attrsObj.stereotype as string) : undefined;
  const umlSourceRole = typeof attrsObj.sourceRole === 'string' ? (attrsObj.sourceRole as string) : undefined;
  const umlTargetRole = typeof attrsObj.targetRole === 'string' ? (attrsObj.targetRole as string) : undefined;
  const umlSourceMultiplicity =
    typeof attrsObj.sourceMultiplicity === 'string' ? (attrsObj.sourceMultiplicity as string) : undefined;
  const umlTargetMultiplicity =
    typeof attrsObj.targetMultiplicity === 'string' ? (attrsObj.targetMultiplicity as string) : undefined;

  const updateAttrs = (patch: Record<string, unknown>): void => {
    actions.updateRelationship(rel.id, { attrs: pruneAttrs({ ...attrsObj, ...patch }) });
  };

  const elementOptions = Object.values(model.elements)
    .filter(Boolean)
    .filter((e) => {
      if (relKind === 'archimate') return true;
      const ek = e.kind ?? inferKindFromType(e.type as unknown as string);
      return ek === relKind;
    })
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
                  {getRelationshipTypeLabel(t)}
                </option>
              ))}
            </select>

            {relKind === 'archimate' ? (
              <>
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
              </>
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

        {relKind === 'uml' ? (
          <>
            <div className="propertiesRow">
              <div className="propertiesKey">Stereotype</div>
              <div className="propertiesValue" style={{ fontWeight: 400 }}>
                <input
                  className="textInput"
                  aria-label="UML relationship stereotype"
                  placeholder="(optional)"
                  value={umlStereotype ?? ''}
                  onChange={(e) => updateAttrs({ stereotype: asTrimmedOrUndef(e.target.value) })}
                />
                <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                  Shown as «stereotype» (rendering support can be added later).
                </div>
              </div>
            </div>

            {rel.type === 'uml.association' ? (
              <div className="propertiesRow">
                <div className="propertiesKey">Directed</div>
                <div className="propertiesValue" style={{ fontWeight: 400 }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      aria-label="UML relationship association directed"
                      checked={!!isDirected}
                      onChange={(e) => updateAttrs({ isDirected: e.target.checked ? true : undefined })}
                    />
                    Directed association
                  </label>
                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                    When enabled, the association is drawn as an arrow from source to target.
                  </div>
                </div>
              </div>
            ) : null}

            <div className="propertiesRow">
              <div className="propertiesKey">Source end</div>
              <div className="propertiesValue" style={{ fontWeight: 400, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input
                  className="textInput"
                  aria-label="UML relationship source role"
                  placeholder="Role name (optional)"
                  value={umlSourceRole ?? ''}
                  onChange={(e) => updateAttrs({ sourceRole: asTrimmedOrUndef(e.target.value) })}
                />
                <input
                  className="textInput"
                  aria-label="UML relationship source multiplicity"
                  placeholder="Multiplicity (e.g. 1, 0..1, 0..*, 1..*)"
                  value={umlSourceMultiplicity ?? ''}
                  onChange={(e) => updateAttrs({ sourceMultiplicity: asTrimmedOrUndef(e.target.value) })}
                />
              </div>
            </div>

            <div className="propertiesRow">
              <div className="propertiesKey">Target end</div>
              <div className="propertiesValue" style={{ fontWeight: 400, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input
                  className="textInput"
                  aria-label="UML relationship target role"
                  placeholder="Role name (optional)"
                  value={umlTargetRole ?? ''}
                  onChange={(e) => updateAttrs({ targetRole: asTrimmedOrUndef(e.target.value) })}
                />
                <input
                  className="textInput"
                  aria-label="UML relationship target multiplicity"
                  placeholder="Multiplicity (e.g. 1, 0..1, 0..*, 1..*)"
                  value={umlTargetMultiplicity ?? ''}
                  onChange={(e) => updateAttrs({ targetMultiplicity: asTrimmedOrUndef(e.target.value) })}
                />
              </div>
            </div>
          </>
        ) : null}

        {relKind === 'archimate' && rel.type === 'Access' && (
          <div className="propertiesRow">
            <div className="propertiesKey">Access type</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <select
                className="selectInput"
                aria-label="Relationship property access type"
                value={accessType ?? 'Access'}
                onChange={(e) =>
                  actions.updateRelationship(rel.id, {
                    attrs: { ...attrsObj, accessType: e.target.value as AccessType }
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

        {relKind === 'archimate' && rel.type === 'Influence' && (
          <div className="propertiesRow">
            <div className="propertiesKey">Strength</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <input
                className="textInput"
                aria-label="Relationship property influence strength"
                placeholder="e.g. +, ++, -, --, 5"
                value={influenceStrength ?? ''}
                onChange={(e) =>
                  actions.updateRelationship(rel.id, {
                    attrs: { ...attrsObj, influenceStrength: e.target.value || undefined }
                  })
                }
              />
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                Optional: use a sign or scale that matches your organization.
              </div>
            </div>
          </div>
        )}

        {relKind === 'archimate' && rel.type === 'Association' && (
          <div className="propertiesRow">
            <div className="propertiesKey">Directed</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  aria-label="Relationship property association directed"
                  checked={!!isDirected}
                  onChange={(e) =>
                    actions.updateRelationship(rel.id, {
                      attrs: { ...attrsObj, isDirected: e.target.checked ? true : undefined }
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
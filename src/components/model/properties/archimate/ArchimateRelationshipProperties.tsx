import { formatElementTypeLabel } from '../../../ui/typeLabels';
import { useEffect, useMemo, useState } from 'react';

import type { AccessType, Element, Model, RelationshipType } from '../../../../domain';
import { getRelationshipTypesForKind, kindFromTypeId } from '../../../../domain';
import {
  getAllowedRelationshipTypes,
  initRelationshipValidationMatrixFromBundledTable,
  validateRelationship,
} from '../../../../domain/config/archimatePalette';

import type { Selection } from '../../selection';
import type { ModelActions } from '../actions';
import { CommonRelationshipProperties } from '../common/CommonRelationshipProperties';

const ACCESS_TYPES: AccessType[] = ['Access', 'Read', 'Write', 'ReadWrite'];

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

export function ArchimateRelationshipProperties({ model, relationshipId, viewId, actions, onSelect }: Props) {
  const rel = model.relationships[relationshipId];

  // Hooks must be called unconditionally (even if we early-return).
  const relKind = rel ? kindFromTypeId(rel.type) : 'archimate';

  const [matrixLoadTick, setMatrixLoadTick] = useState(0);

  useEffect(() => {
    if (relKind !== 'archimate') return;
    let cancelled = false;
    void initRelationshipValidationMatrixFromBundledTable().then(() => {
      if (!cancelled) setMatrixLoadTick((t) => t + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [relKind]);

  const [showAllRelationshipTypes, setShowAllRelationshipTypes] = useState(false);
  useEffect(() => {
    // Reset per selection to avoid surprising carry-over when clicking between relationships.
    setShowAllRelationshipTypes(false);
  }, [relationshipId]);

  const sourceElement = rel?.sourceElementId ? model.elements[rel.sourceElementId] : undefined;
  const targetElement = rel?.targetElementId ? model.elements[rel.targetElementId] : undefined;
  const sourceType = sourceElement?.type;
  const targetType = targetElement?.type;

  const relType = rel?.type ?? 'Unknown';
  const relIsUnknown = relType === 'Unknown';

  const allowedRelationshipTypes = useMemo(() => {
    // Dependency tick to recompute when the relationship matrix loads/changes.
    void matrixLoadTick;

    const allForKind = getRelationshipTypesForKind(relKind) as RelationshipType[];
    if (!sourceType || !targetType) return allForKind;
    const allowed = getAllowedRelationshipTypes(sourceType, targetType);
    return (allowed.length > 0 ? allowed : allForKind) as RelationshipType[];
  }, [sourceType, targetType, matrixLoadTick, relKind]);

  const relationshipRuleWarning = useMemo(() => {
    // Dependency tick to recompute when the relationship matrix loads/changes.
    void matrixLoadTick;

    if (!rel) return null;
    if (!sourceType || !targetType) return null;
    if (relIsUnknown) return null;

    const res = validateRelationship(sourceType, targetType, relType as RelationshipType);
    return res.allowed ? null : res.reason;
  }, [sourceType, targetType, relType, relIsUnknown, matrixLoadTick, rel]);

  const relationshipTypeOptions = useMemo<RelationshipType[]>(() => {
    const allForKind = getRelationshipTypesForKind(relKind) as RelationshipType[];
    if (!rel) return allForKind;

    const base: RelationshipType[] = showAllRelationshipTypes ? allForKind : allowedRelationshipTypes;
    const list: RelationshipType[] = [...base];

    const seen = new Set(list);

    // Keep current value visible even if it's not in the filtered set.
    if (relIsUnknown) {
      return ['Unknown', ...list.filter((t) => t !== 'Unknown')];
    }

    if (relType && !seen.has(relType as RelationshipType)) return [relType as RelationshipType, ...list];
    return list;
  }, [showAllRelationshipTypes, allowedRelationshipTypes, relType, relIsUnknown, relKind, rel]);

  const elementOptions: Element[] = useMemo(() => {
    const elems = Object.values(model.elements).filter(Boolean);
    // ArchiMate relationships can connect across model kinds (current behaviour).
    return elems.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, undefined, { sensitivity: 'base' }));
  }, [model]);

  if (!rel) return <p className="panelHint">Relationship not found.</p>;

  const attrsObj: Record<string, unknown> =
    rel.attrs && typeof rel.attrs === 'object' ? (rel.attrs as Record<string, unknown>) : {};
  const accessType = typeof attrsObj.accessType === 'string' ? (attrsObj.accessType as string) : undefined;

  const updateAttrs = (patch: Record<string, unknown>): void => {
    actions.updateRelationship(rel.id, { attrs: pruneAttrs({ ...attrsObj, ...patch }) });
  };

  const typeExtra = (
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
          Showing types allowed for <span style={{ opacity: 0.95 }}>{formatElementTypeLabel(sourceElement)}</span> →{' '}
          <span style={{ opacity: 0.95 }}>{formatElementTypeLabel(targetElement)}</span>.
        </div>
      ) : null}

      {relationshipRuleWarning ? (
        <div className="panelHint" style={{ color: '#ffb3b3', opacity: 0.95 }}>
          {relationshipRuleWarning}
        </div>
      ) : null}
    </>
  );

  const notationRows =
    rel.type === 'Access' ? (
      <div className="propertiesRow">
        <div className="propertiesKey">Access type</div>
        <div className="propertiesValue" style={{ fontWeight: 400 }}>
          <select
            className="selectInput"
            aria-label="Archimate access type"
            value={accessType ?? 'Access'}
            onChange={(e) => updateAttrs({ accessType: e.target.value as AccessType })}
          >
            {ACCESS_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>
    ) : null;

  return (
    <CommonRelationshipProperties
      model={model}
      relationship={rel}
      relationshipTypeOptions={relationshipTypeOptions}
      elementOptions={elementOptions}
      viewId={viewId}
      actions={actions}
      onSelect={onSelect}
      typeExtra={typeExtra}
      notationRows={notationRows}
    />
  );
}

import { useMemo } from 'react';

import type { Element, Model, RelationshipType } from '../../../../domain';
import { getRelationshipTypesForKind, kindFromTypeId } from '../../../../domain';
import { getNotation } from '../../../../notations/registry';

import type { Selection } from '../../selection';
import type { ModelActions } from '../actions';
import { useModelStore } from '../../../../store';
import { CommonRelationshipProperties } from '../common/CommonRelationshipProperties';

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

export function UmlRelationshipProperties({ model, relationshipId, viewId, actions, onSelect }: Props) {
  const rel = model.relationships[relationshipId];
  const relationshipValidationMode = useModelStore((s) => s.relationshipValidationMode);

  if (!rel) return <p className="panelHint">Relationship not found.</p>;

  const relKind = kindFromTypeId(rel.type);
  const notation = getNotation(relKind);

  const attrsObj: Record<string, unknown> =
    rel.attrs && typeof rel.attrs === 'object' ? (rel.attrs as Record<string, unknown>) : {};
  const umlStereotype = typeof attrsObj.stereotype === 'string' ? (attrsObj.stereotype as string) : undefined;
  const umlSourceRole = typeof attrsObj.sourceRole === 'string' ? (attrsObj.sourceRole as string) : undefined;
  const umlTargetRole = typeof attrsObj.targetRole === 'string' ? (attrsObj.targetRole as string) : undefined;
  const umlSourceMultiplicity =
    typeof attrsObj.sourceMultiplicity === 'string' ? (attrsObj.sourceMultiplicity as string) : undefined;
  const umlTargetMultiplicity =
    typeof attrsObj.targetMultiplicity === 'string' ? (attrsObj.targetMultiplicity as string) : undefined;
  const isDirected = typeof attrsObj.isDirected === 'boolean' ? (attrsObj.isDirected as boolean) : false;

  const updateAttrs = (patch: Record<string, unknown>): void => {
    actions.updateRelationship(rel.id, { attrs: pruneAttrs({ ...attrsObj, ...patch }) });
  };

  const relationshipTypeOptions = useMemo<RelationshipType[]>(() => {
    const allForKind = getRelationshipTypesForKind(relKind) as RelationshipType[];
    const list: RelationshipType[] = [...allForKind];
    const seen = new Set(list);

    if (rel.type === 'Unknown') return ['Unknown', ...list.filter((t) => t !== 'Unknown')];

    if (rel.type && !seen.has(rel.type as RelationshipType)) return [rel.type as RelationshipType, ...list];
    return list;
  }, [rel.type, relKind]);

  const elementOptions: Element[] = useMemo(() => {
    const elems = Object.values(model.elements)
      .filter(Boolean)
      .filter((e) => {
        const ek = (e as any).kind ?? kindFromTypeId(e.type as unknown as string);
        return ek === relKind;
      });

    return elems.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, undefined, { sensitivity: 'base' }));
  }, [model, relKind]);

  const sourceType = rel.sourceElementId ? model.elements[rel.sourceElementId]?.type : undefined;
  const targetType = rel.targetElementId ? model.elements[rel.targetElementId]?.type : undefined;
  const relationshipRuleWarning = useMemo(() => {
    if (!sourceType || !targetType) return null;
    if (rel.type === 'Unknown') return null;

    const res = notation.canCreateRelationship({
      relationshipType: rel.type as unknown as string,
      sourceType,
      targetType,
      mode: relationshipValidationMode,
    });
    return res.allowed ? null : (res.reason ?? 'This relationship is not allowed for the selected types.');
  }, [notation, rel.type, sourceType, targetType, relationshipValidationMode]);

  const typeExtra = relationshipRuleWarning ? (
    <div className="panelHint" style={{ color: '#ffb3b3', opacity: 0.95 }}>
      {relationshipRuleWarning}
    </div>
  ) : null;

  const notationRows = (
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
        <>
          <div className="propertiesRow">
            <div className="propertiesKey">Directed</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.85 }}>
                <input
                  type="checkbox"
                  aria-label="UML association directed"
                  checked={!!isDirected}
                  onChange={(e) => updateAttrs({ isDirected: e.target.checked ? true : undefined })}
                />
                Directed association
              </label>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                If checked, render as a navigable association (direction support can be improved later).
              </div>
            </div>
          </div>

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
    </>
  );

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

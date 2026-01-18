import { useMemo } from 'react';

import type { Element, Model, RelationshipType } from '../../../../domain';
import { getRelationshipTypesForKind, kindFromTypeId, STRONGEST_RELATIONSHIP_VALIDATION_MODE } from '../../../../domain';
import { canCreateUmlRelationship } from '../../../../notations/uml/rules';

import type { Selection } from '../../selection';
import type { ModelActions } from '../actions';
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
  const relationshipValidationMode = STRONGEST_RELATIONSHIP_VALIDATION_MODE;

  // Hooks must be called unconditionally (even if we early-return).
  const relKind = rel ? kindFromTypeId(rel.type) : 'uml';

  const relationshipTypeOptions = useMemo<RelationshipType[]>(() => {
    const allForKind = getRelationshipTypesForKind(relKind) as RelationshipType[];
    if (!rel) return allForKind;

    const list: RelationshipType[] = [...allForKind];
    const seen = new Set(list);

    if (rel.type === 'Unknown') return ['Unknown', ...list.filter((t) => t !== 'Unknown')];

    if (rel.type && !seen.has(rel.type as RelationshipType)) return [rel.type as RelationshipType, ...list];
    return list;
  }, [rel, relKind]);

  const elementOptions: Element[] = useMemo(() => {
    const elems = Object.values(model.elements)
      .filter(Boolean)
      .filter((e) => {
        const maybeKind = (e as unknown as { kind?: string }).kind;
        const ek = maybeKind ?? kindFromTypeId(e.type as unknown as string);
        return ek === relKind;
      });

    return elems.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, undefined, { sensitivity: 'base' }));
  }, [model, relKind]);

  const sourceType = rel?.sourceElementId ? model.elements[rel.sourceElementId]?.type : undefined;
  const targetType = rel?.targetElementId ? model.elements[rel.targetElementId]?.type : undefined;
  const relationshipRuleWarning = useMemo(() => {
    if (!rel) return null;
    if (!sourceType || !targetType) return null;
    if (rel.type === 'Unknown') return null;

    const res = canCreateUmlRelationship({
      relationshipType: rel.type as unknown as string,
      sourceType,
      targetType,
      mode: relationshipValidationMode,
    });
    return res.allowed ? null : (res.reason ?? 'This relationship is not allowed for the selected types.');
  }, [rel, sourceType, targetType, relationshipValidationMode]);

  if (!rel) return <p className="panelHint">Relationship not found.</p>;

  const attrsObj: Record<string, unknown> =
    rel.attrs && typeof rel.attrs === 'object' ? (rel.attrs as Record<string, unknown>) : {};
  const umlStereotype = typeof attrsObj.stereotype === 'string' ? (attrsObj.stereotype as string) : undefined;
  const umlSourceRole = typeof attrsObj.sourceRole === 'string' ? (attrsObj.sourceRole as string) : undefined;
  const umlTargetRole = typeof attrsObj.targetRole === 'string' ? (attrsObj.targetRole as string) : undefined;
  const umlSourceMultiplicity =
    typeof attrsObj.sourceMultiplicity === 'string' ? (attrsObj.sourceMultiplicity as string) : undefined;
  const umlTargetMultiplicity =
    typeof attrsObj.targetMultiplicity === 'string' ? (attrsObj.targetMultiplicity as string) : undefined;
  const umlSourceNavigable = typeof attrsObj.sourceNavigable === 'boolean' ? (attrsObj.sourceNavigable as boolean) : false;
  const umlTargetNavigable = typeof attrsObj.targetNavigable === 'boolean' ? (attrsObj.targetNavigable as boolean) : false;
  const isDirected = typeof attrsObj.isDirected === 'boolean' ? (attrsObj.isDirected as boolean) : false;

  const updateAttrs = (patch: Record<string, unknown>): void => {
    actions.updateRelationship(rel.id, { attrs: pruneAttrs({ ...attrsObj, ...patch }) });
  };

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

      {rel.type === 'uml.association' || rel.type === 'uml.aggregation' || rel.type === 'uml.composition' ? (
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
                Show arrow direction
              </label>
            </div>
          </div>

          <div className="propertiesRow">
            <div className="propertiesKey">Navigability</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.85 }}>
                  <input
                    type="checkbox"
                    aria-label="UML source navigable"
                    checked={!!umlSourceNavigable}
                    onChange={(e) => updateAttrs({ sourceNavigable: e.target.checked ? true : undefined })}
                  />
                  Source end navigable
                </label>

                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.85 }}>
                  <input
                    type="checkbox"
                    aria-label="UML target navigable"
                    checked={!!umlTargetNavigable}
                    onChange={(e) => updateAttrs({ targetNavigable: e.target.checked ? true : undefined })}
                  />
                  Target end navigable
                </label>
              </div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                Stored for import fidelity (rendering support can be added later).
              </div>
            </div>
          </div>

          <div className="propertiesRow">
            <div className="propertiesKey">Source role</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <input
                className="textInput"
                aria-label="UML association source role"
                placeholder="(optional)"
                value={umlSourceRole ?? ''}
                onChange={(e) => updateAttrs({ sourceRole: asTrimmedOrUndef(e.target.value) })}
              />
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>Shown near the source end.</div>
            </div>
          </div>

          <div className="propertiesRow">
            <div className="propertiesKey">Source multiplicity</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <input
                className="textInput"
                aria-label="UML association source multiplicity"
                placeholder="(optional)"
                value={umlSourceMultiplicity ?? ''}
                onChange={(e) => updateAttrs({ sourceMultiplicity: asTrimmedOrUndef(e.target.value) })}
              />
            </div>
          </div>

          <div className="propertiesRow">
            <div className="propertiesKey">Target role</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <input
                className="textInput"
                aria-label="UML association target role"
                placeholder="(optional)"
                value={umlTargetRole ?? ''}
                onChange={(e) => updateAttrs({ targetRole: asTrimmedOrUndef(e.target.value) })}
              />
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>Shown near the target end.</div>
            </div>
          </div>

          <div className="propertiesRow">
            <div className="propertiesKey">Target multiplicity</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <input
                className="textInput"
                aria-label="UML association target multiplicity"
                placeholder="(optional)"
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

import { useMemo } from 'react';

import type { Element, Model, RelationshipType } from '../../../../domain';
import { getRelationshipTypesForKind, kindFromTypeId } from '../../../../domain';
import { isBpmnMessageFlowAttrs, isBpmnSequenceFlowAttrs } from '../../../../domain/bpmnAttrs';
import type { BpmnSequenceFlowAttrs, BpmnMessageFlowAttrs } from '../../../../domain/bpmnAttrs';

import type { Selection } from '../../selection';
import type { ModelActions } from '../actions';
import { CommonRelationshipProperties } from '../common/CommonRelationshipProperties';
import { TextAreaRow } from '../editors/TextAreaRow';

import { bpmnElementOptionLabel } from './bpmnOptionLabel';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
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

/**
 * BPMN relationship properties (Level 2).
 *
 * We reuse the shared relationship panel and inject lightweight BPMN semantics:
 * - Sequence Flow: condition expression + "default" flag
 * - Message Flow: messageRef
 */
export function BpmnRelationshipProperties({ model, relationshipId, viewId, actions, onSelect }: Props) {
  const rel = model.relationships[relationshipId];

  const relationshipTypeOptions = useMemo<RelationshipType[]>(() => {
    const base = getRelationshipTypesForKind('bpmn') as RelationshipType[];
    if (!rel) return base;

    const list: RelationshipType[] = [...base];
    const seen = new Set(list);

    if (rel.type === 'Unknown') return ['Unknown', ...list.filter((t) => t !== 'Unknown')];
    if (rel.type && !seen.has(rel.type as RelationshipType)) return [rel.type as RelationshipType, ...list];
    return list;
  }, [rel]);

  const elementOptions: Element[] = useMemo(() => {
    const elems = Object.values(model.elements)
      .filter(Boolean)
      .filter((e) => {
        const k = (e as unknown as { kind?: string }).kind ?? kindFromTypeId(e.type as unknown as string);
        return k === 'bpmn';
      });

    return elems.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, undefined, { sensitivity: 'base' }));
  }, [model]);


  const messageOptions = useMemo(
    () =>
      Object.values(model.elements)
        .filter(Boolean)
        .filter((e) => String(e.type) === 'bpmn.message')
        .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, undefined, { sensitivity: 'base' })),
    [model.elements]
  );

  const sourceType = rel?.sourceElementId ? model.elements[rel.sourceElementId]?.type : undefined;
  const targetType = rel?.targetElementId ? model.elements[rel.targetElementId]?.type : undefined;

  const relationshipRuleWarning = useMemo(() => {
    if (!rel) return null;
    if (!sourceType || !targetType) return null;

    if (rel.type === 'bpmn.sequenceFlow') {
      const sourceOk = String(sourceType).startsWith('bpmn.');
      const targetOk = String(targetType).startsWith('bpmn.');
      if (!sourceOk || !targetOk) return 'Sequence Flow must connect two BPMN elements.';
      if (sourceType === 'bpmn.pool' || sourceType === 'bpmn.lane') return 'Sequence Flow cannot start from a Pool or Lane.';
      if (targetType === 'bpmn.pool' || targetType === 'bpmn.lane') return 'Sequence Flow cannot end at a Pool or Lane.';
      return null;
    }

    if (rel.type === 'bpmn.messageFlow') {
      const sourceOk = String(sourceType).startsWith('bpmn.');
      const targetOk = String(targetType).startsWith('bpmn.');
      if (!sourceOk || !targetOk) return 'Message Flow must connect two BPMN elements.';
      if (sourceType === 'bpmn.lane' || targetType === 'bpmn.lane') return 'Message Flow cannot connect to a Lane directly.';
      return 'Message Flow is intended for communication between different Pools/Participants.';
    }

    return null;
  }, [rel, sourceType, targetType]);

  if (!rel) return <p className="panelHint">Relationship not found.</p>;

  const attrsObj: Record<string, unknown> = rel.attrs && isRecord(rel.attrs) ? (rel.attrs as Record<string, unknown>) : {};

  const updateAttrs = (patch: Record<string, unknown>): void => {
    actions.updateRelationship(rel.id, { attrs: pruneAttrs({ ...attrsObj, ...patch }) });
  };

  const sequenceAttrs: BpmnSequenceFlowAttrs | undefined = isBpmnSequenceFlowAttrs(attrsObj) ? attrsObj : undefined;
  const messageAttrs: BpmnMessageFlowAttrs | undefined = isBpmnMessageFlowAttrs(attrsObj) ? attrsObj : undefined;

  const conditionExpression = sequenceAttrs?.conditionExpression ?? '';
  const isDefault = sequenceAttrs?.isDefault ?? false;
  const messageRef = messageAttrs?.messageRef ?? '';

  const notationRows = (
    <>
      {rel.type === 'bpmn.sequenceFlow' ? (
        <>
          <TextAreaRow
            label="Condition"
            ariaLabel="BPMN sequence flow condition"
            value={conditionExpression}
            onChange={(v) => updateAttrs({ conditionExpression: v.trim().length ? v : undefined })}
            placeholder="(optional)"
          />
          <div className="propertiesRow">
            <div className="propertiesKey">Default</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.85 }}>
                <input
                  type="checkbox"
                  aria-label="BPMN sequence flow default"
                  checked={!!isDefault}
                  onChange={(e) => updateAttrs({ isDefault: e.target.checked ? true : undefined })}
                />
                Mark as default
              </label>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                Gateways can also point to a default flow via their own properties.
              </div>
            </div>
          </div>
        </>
      ) : null}

      {rel.type === 'bpmn.messageFlow' ? (
        <div className="propertiesRow">
          <div className="propertiesKey">Message</div>
          <div className="propertiesValue">
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select
                className="selectInput"
                aria-label="BPMN message flow ref"
                value={messageRef}
                onChange={(e) => updateAttrs({ messageRef: e.target.value ? e.target.value : undefined })}
                style={{ flex: 1, minWidth: 0 }}
              >
                <option value="">(none)</option>
                {messageOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {bpmnElementOptionLabel(o)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="miniButton"
                aria-label="Go to referenced message"
                disabled={!messageRef || !model.elements[messageRef]}
                onClick={() => messageRef && model.elements[messageRef] && onSelect?.({ kind: 'element', elementId: messageRef })}
              >
                Go
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {rel.attrs && rel.type === 'bpmn.association' ? (
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          Association currently has no semantic fields; it is mainly used to link annotations.
        </div>
      ) : null}
    </>
  );

  const typeExtra = relationshipRuleWarning ? (
    <div className="panelHint" style={{ color: '#ffb3b3', opacity: 0.95 }}>
      {relationshipRuleWarning}
    </div>
  ) : null;

  return (
    <CommonRelationshipProperties
      model={model}
      relationship={rel}
      relationshipTypeOptions={relationshipTypeOptions as RelationshipType[]}
      elementOptions={elementOptions}
      viewId={viewId}
      actions={actions}
      onSelect={onSelect}
      typeExtra={typeExtra}
      notationRows={notationRows}
    />
  );
}

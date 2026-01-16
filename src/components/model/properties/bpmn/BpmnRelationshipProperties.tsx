import { useMemo } from 'react';

import type { Element, Model, RelationshipType } from '../../../../domain';
import { getRelationshipTypesForKind, kindFromTypeId } from '../../../../domain';

import type { Selection } from '../../selection';
import type { ModelActions } from '../actions';
import { CommonRelationshipProperties } from '../common/CommonRelationshipProperties';

type Props = {
  model: Model;
  relationshipId: string;
  /** Optional: when the relationship is selected from within a view, this enables view-specific connection props. */
  viewId?: string;
  actions: ModelActions;
  onSelect?: (selection: Selection) => void;
};

/**
 * Minimal BPMN relationship properties (v1).
 *
 * We intentionally reuse the shared relationship panel for name/type/docs/endpoints,
 * and keep BPMN-specific fields for later versions.
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

  const sourceType = rel?.sourceElementId ? model.elements[rel.sourceElementId]?.type : undefined;
  const targetType = rel?.targetElementId ? model.elements[rel.targetElementId]?.type : undefined;

  const relationshipRuleWarning = useMemo(() => {
    if (!rel) return null;
    if (rel.type !== 'bpmn.sequenceFlow') return null;
    if (!sourceType || !targetType) return null;

    const sourceOk = String(sourceType).startsWith('bpmn.');
    const targetOk = String(targetType).startsWith('bpmn.');
    if (sourceOk && targetOk) return null;
    return 'Sequence Flow must connect two BPMN elements.';
  }, [rel, sourceType, targetType]);

  if (!rel) return <p className="panelHint">Relationship not found.</p>;

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
    />
  );
}

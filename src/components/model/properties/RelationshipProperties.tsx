import { useMemo } from 'react';

import type { Element, Model, RelationshipType } from '../../../domain';
import { getRelationshipTypesForKind, kindFromTypeId } from '../../../domain';

import type { Selection } from '../selection';
import type { ModelActions } from './actions';
import { ArchimateRelationshipProperties } from './archimate/ArchimateRelationshipProperties';
import { UmlRelationshipProperties } from './uml/UmlRelationshipProperties';
import { CommonRelationshipProperties } from './common/CommonRelationshipProperties';

type Props = {
  model: Model;
  relationshipId: string;
  /** Optional: when the relationship is selected from within a view, this enables view-specific connection props. */
  viewId?: string;
  actions: ModelActions;
  onSelect?: (selection: Selection) => void;
};

export function RelationshipProperties({ model, relationshipId, viewId, actions, onSelect }: Props) {
  const rel = model.relationships[relationshipId];
  if (!rel) return <p className="panelHint">Relationship not found.</p>;

  const kind = kindFromTypeId(rel.type);

  if (kind === 'archimate') {
    return <ArchimateRelationshipProperties model={model} relationshipId={relationshipId} viewId={viewId} actions={actions} onSelect={onSelect} />;
  }

  if (kind === 'uml') {
    return <UmlRelationshipProperties model={model} relationshipId={relationshipId} viewId={viewId} actions={actions} onSelect={onSelect} />;
  }

  // BPMN or other kinds: show common properties with the kind's type catalog.
  const relationshipTypeOptions = useMemo<RelationshipType[]>(() => {
    const allForKind = getRelationshipTypesForKind(kind) as RelationshipType[];
    const list: RelationshipType[] = [...allForKind];
    const seen = new Set(list);

    if (rel.type === 'Unknown') return ['Unknown', ...list.filter((t) => t !== 'Unknown')];
    if (rel.type && !seen.has(rel.type as RelationshipType)) return [rel.type as RelationshipType, ...list];
    return list;
  }, [kind, rel.type]);

  const elementOptions: Element[] = useMemo(() => {
    const elems = Object.values(model.elements)
      .filter(Boolean)
      .filter((e) => {
        const ek = (e as any).kind ?? kindFromTypeId(e.type as unknown as string);
        return ek === kind;
      });

    return elems.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, undefined, { sensitivity: 'base' }));
  }, [model, kind]);

  return (
    <CommonRelationshipProperties
      model={model}
      relationship={rel}
      relationshipTypeOptions={relationshipTypeOptions}
      elementOptions={elementOptions}
      viewId={viewId}
      actions={actions}
      onSelect={onSelect}
    />
  );
}

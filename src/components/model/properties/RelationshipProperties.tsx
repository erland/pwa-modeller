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

  // Hooks must be called unconditionally (even if we early-return).
  const kind = rel ? kindFromTypeId(rel.type) : 'archimate';

  const relationshipTypeOptions = useMemo<RelationshipType[]>(() => {
    if (!rel) return [];
    const allForKind = getRelationshipTypesForKind(kind) as RelationshipType[];
    const list: RelationshipType[] = [...allForKind];
    const seen = new Set(list);

    if (rel.type === 'Unknown') return ['Unknown', ...list.filter((t) => t !== 'Unknown')];
    if (rel.type && !seen.has(rel.type as RelationshipType)) return [rel.type as RelationshipType, ...list];
    return list;
  }, [kind, rel]);

  const elementOptions = useMemo<Element[]>(() => {
    const elems = Object.values(model.elements)
      .filter(Boolean)
      .filter((e) => {
        const maybeKind = (e as unknown as { kind?: string }).kind;
        const ek = maybeKind ?? kindFromTypeId(e.type as unknown as string);
        return ek === kind;
      });

    return elems.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, undefined, { sensitivity: 'base' }));
  }, [model, kind]);

  if (!rel) return <p className="panelHint">Relationship not found.</p>;

  if (kind === 'archimate') {
    return (
      <ArchimateRelationshipProperties
        model={model}
        relationshipId={relationshipId}
        viewId={viewId}
        actions={actions}
        onSelect={onSelect}
      />
    );
  }

  if (kind === 'uml') {
    return (
      <UmlRelationshipProperties
        model={model}
        relationshipId={relationshipId}
        viewId={viewId}
        actions={actions}
        onSelect={onSelect}
      />
    );
  }

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

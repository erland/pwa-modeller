import type { Model } from '../../../domain';
import { kindFromTypeId } from '../../../domain';
import { getNotation } from '../../../notations/registry';

import type { Selection } from '../selection';
import type { ModelActions } from './actions';

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
  const notation = getNotation(kind);

  return <>{notation.renderRelationshipProperties({ model, relationshipId, viewId, actions, onSelect })}</>;
}

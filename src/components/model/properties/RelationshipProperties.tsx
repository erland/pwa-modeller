import type { Model } from '../../../domain';
import { computeVisibleRelationshipIdsForView, kindFromTypeId } from '../../../domain';
import { getNotation } from '../../../notations/registry';

import type { Selection } from '../selection';
import type { ModelActions } from './actions';

type Props = {
  model: Model;
  relationshipId: string;
  /** Optional: when the relationship is selected from within a view, this enables view-specific connection props. */
  viewId?: string;
  /** Optional: when a diagram is open, use this view as context even if selection didn't originate in the diagram. */
  activeViewId?: string | null;
  actions: ModelActions;
  onSelect?: (selection: Selection) => void;
};

export function RelationshipProperties({ model, relationshipId, viewId, activeViewId, actions, onSelect }: Props) {
  const rel = model.relationships[relationshipId];
  if (!rel) return <p className="panelHint">Relationship not found.</p>;

  const effectiveViewId = viewId ?? (activeViewId ?? undefined);
  const view = effectiveViewId ? model.views[effectiveViewId] : undefined;
  const isInViewContext = Boolean(effectiveViewId && view);
  const isVisibleInView = isInViewContext ? computeVisibleRelationshipIdsForView(model, view!).includes(relationshipId) : true;

  const kind = kindFromTypeId(rel.type);
  const notation = getNotation(kind);

  return (
    <>
      {isInViewContext && (
        <div className="propertiesSection">
          <div className="propertiesSectionTitle">Diagram visibility</div>
          <div className="propertiesRow">
            <div className="propertiesKey">This diagram</div>
            <div className="propertiesValue">
              <button
                type="button"
                className="shellButton"
                onClick={() => {
                  if (!effectiveViewId) return;
                  if (isVisibleInView) actions.hideRelationshipInView(effectiveViewId, relationshipId);
                  else actions.showRelationshipInView(effectiveViewId, relationshipId);
                }}
                title={isVisibleInView ? 'Hide this relationship in this diagram' : 'Show this relationship in this diagram'}
              >
                {isVisibleInView ? 'Hide in this diagram' : 'Show in this diagram'}
              </button>

              <span className="panelHint" style={{ marginLeft: 8 }}>
                {view?.relationshipVisibility?.mode === 'explicit'
                  ? 'Explicit'
                  : 'Implicit'}
              </span>
            </div>
          </div>
        </div>
      )}

      {notation.renderRelationshipProperties({ model, relationshipId, viewId: effectiveViewId, actions, onSelect })}
    </>
  );
}

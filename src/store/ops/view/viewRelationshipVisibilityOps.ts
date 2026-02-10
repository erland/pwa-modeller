import type { View } from '../../../domain';
import {
  computeVisibleRelationshipIdsForView,
  materializeViewConnectionsForView,
} from '../../../domain';
import type { ViewOpsDeps } from './viewOpsTypes';

export const createViewRelationshipVisibilityOps = (deps: ViewOpsDeps) => {
  const { updateModel } = deps;

  const includeRelationshipInView = (viewId: string, relationshipId: string): void => {
    updateModel((model) => {
      const view = model.views[viewId];
      if (!view) return;
      const rv = view.relationshipVisibility;
      if (!rv || rv.mode !== 'explicit') return;
      if (!relationshipId || !model.relationships[relationshipId]) return;

      const nextIds = Array.from(
        new Set(
          [...(Array.isArray(rv.relationshipIds) ? rv.relationshipIds : []), relationshipId].filter(
            (id) => typeof id === 'string' && id.length > 0
          )
        )
      ).sort((a, b) => a.localeCompare(b));

      model.views[viewId] = {
        ...view,
        relationshipVisibility: { mode: 'explicit', relationshipIds: nextIds },
      };
    });
  };

  const hideRelationshipInView = (viewId: string, relationshipId: string): void => {
    updateModel((model) => {
      const view = model.views[viewId];
      if (!view) return;
      if (!relationshipId || !model.relationships[relationshipId]) return;

      const currentIds =
        view.relationshipVisibility?.mode === 'explicit'
          ? (Array.isArray(view.relationshipVisibility.relationshipIds) ? view.relationshipVisibility.relationshipIds : [])
          : computeVisibleRelationshipIdsForView(model, view);

      const nextIds = Array.from(
        new Set(
          currentIds
            .filter((id) => typeof id === 'string' && id.length > 0)
            .filter((id) => id !== relationshipId)
        )
      ).sort((a, b) => a.localeCompare(b));

      const nextView: View = {
        ...view,
        relationshipVisibility: { mode: 'explicit', relationshipIds: nextIds },
      };

      // Re-materialize connections so the hidden relationship disappears from the diagram.
      model.views[viewId] = { ...nextView, connections: materializeViewConnectionsForView(model, nextView) };
    });
  };

  const showRelationshipInView = (viewId: string, relationshipId: string): void => {
    updateModel((model) => {
      const view = model.views[viewId];
      if (!view) return;
      if (!relationshipId || !model.relationships[relationshipId]) return;

      const currentIds =
        view.relationshipVisibility?.mode === 'explicit'
          ? (Array.isArray(view.relationshipVisibility.relationshipIds) ? view.relationshipVisibility.relationshipIds : [])
          : computeVisibleRelationshipIdsForView(model, view);

      const nextIds = Array.from(
        new Set([...currentIds.filter((id) => typeof id === 'string' && id.length > 0), relationshipId])
      ).sort((a, b) => a.localeCompare(b));

      const nextView: View = {
        ...view,
        relationshipVisibility: { mode: 'explicit', relationshipIds: nextIds },
      };

      model.views[viewId] = { ...nextView, connections: materializeViewConnectionsForView(model, nextView) };
    });
  };

  return {
    includeRelationshipInView,
    hideRelationshipInView,
    showRelationshipInView,
  };
};

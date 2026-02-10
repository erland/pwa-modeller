import type {
  Model,
  View,
  ViewConnectionRouteKind,
  ViewConnectionAnchorSide,
  ViewFormatting,
  ViewObject,
  ViewObjectType,
  ViewNodeLayout,
} from '../../domain';
import { materializeViewConnectionsForView, computeVisibleRelationshipIdsForView } from '../../domain';
import type { TaggedValueInput } from '../mutations';
import { viewMutations, viewObjectMutations, layoutMutations } from '../mutations';

export type ViewOpsDeps = {
  updateModel: (mutator: (model: Model) => void, markDirty?: boolean) => void;
};

export const createViewOps = (deps: ViewOpsDeps) => {
  const { updateModel } = deps;

  const addView = (view: View, folderId?: string): void => {
    updateModel((model) => viewMutations.addView(model, view, folderId));
  };

  const updateView = (viewId: string, patch: Partial<Omit<View, 'id'>>): void => {
    updateModel((model) => viewMutations.updateView(model, viewId, patch));
  };

  const ensureViewConnections = (viewId: string): void => {
    updateModel((model) => {
      const view = model.views[viewId];
      if (!view) return;
      const nextConnections = materializeViewConnectionsForView(model, view);

      // If this view uses explicit relationship visibility, prune any stale ids
      // (e.g. deleted relationships) to keep the stored list tidy.
      const rv = view.relationshipVisibility;
      if (rv?.mode === 'explicit') {
        const raw = Array.isArray(rv.relationshipIds) ? rv.relationshipIds : [];
        const pruned = Array.from(
          new Set(raw.filter((id) => typeof id === 'string' && id.length > 0 && Boolean(model.relationships[id])))
        ).sort((a, b) => a.localeCompare(b));
        model.views[viewId] = {
          ...view,
          relationshipVisibility: { mode: 'explicit', relationshipIds: pruned },
          connections: nextConnections,
        };
        return;
      }

      model.views[viewId] = { ...view, connections: nextConnections };
    });
  };

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

  const setViewConnectionRoute = (viewId: string, connectionId: string, kind: ViewConnectionRouteKind): void => {
    updateModel((model) => {
      const view = model.views[viewId];
      if (!view || !Array.isArray(view.connections)) return;
      const idx = view.connections.findIndex((c) => c.id === connectionId);
      if (idx < 0) return;

      const current = view.connections[idx];
      const nextConn = {
        ...current,
        route: { ...(current.route ?? { kind: 'orthogonal' }), kind },
      };
      const nextConnections = [...view.connections];
      nextConnections[idx] = nextConn;
      model.views[viewId] = { ...view, connections: nextConnections };
    });
  };

  const setViewConnectionEndpointAnchors = (
    viewId: string,
    connectionId: string,
    patch: { sourceAnchor?: ViewConnectionAnchorSide; targetAnchor?: ViewConnectionAnchorSide }
  ): void => {
    updateModel((model) => {
      const view = model.views[viewId];
      if (!view || !Array.isArray(view.connections)) return;
      const idx = view.connections.findIndex((c) => c.id === connectionId);
      if (idx < 0) return;

      const current = view.connections[idx];
      const nextConn = {
        ...current,
        // Allow explicitly clearing anchors by passing `undefined`.
        // Using nullish coalescing here would prevent clearing back to auto.
        sourceAnchor: 'sourceAnchor' in patch ? patch.sourceAnchor : current.sourceAnchor,
        targetAnchor: 'targetAnchor' in patch ? patch.targetAnchor : current.targetAnchor,
      };
      const nextConnections = [...view.connections];
      nextConnections[idx] = nextConn;
      model.views[viewId] = { ...view, connections: nextConnections };
    });
  };

  const upsertViewTaggedValue = (viewId: string, entry: TaggedValueInput): void => {
    updateModel((model) => viewMutations.upsertViewTaggedValue(model, viewId, entry));
  };

  const removeViewTaggedValue = (viewId: string, taggedValueId: string): void => {
    updateModel((model) => viewMutations.removeViewTaggedValue(model, viewId, taggedValueId));
  };

  const updateViewFormatting = (viewId: string, patch: Partial<ViewFormatting>): void => {
    updateModel((model) => viewMutations.updateViewFormatting(model, viewId, patch));
  };

  const cloneView = (viewId: string): string | null => {
    let created: string | null = null;
    updateModel((model) => {
      created = viewMutations.cloneView(model, viewId);
    });
    return created;
  };

  const deleteView = (viewId: string): void => {
    updateModel((model) => viewMutations.deleteView(model, viewId));
  };

  const addViewObject = (viewId: string, obj: ViewObject, node?: ViewNodeLayout): void => {
    updateModel((model) => viewObjectMutations.addViewObject(model, viewId, obj, node));
  };

  const createViewObjectInViewAt = (viewId: string, type: ViewObjectType, x: number, y: number): string => {
    let created = '';
    updateModel((model) => {
      created = viewObjectMutations.createViewObjectInViewAt(model, viewId, type, x, y);
    });
    return created;
  };

  const updateViewObject = (viewId: string, objectId: string, patch: Partial<Omit<ViewObject, 'id'>>): void => {
    updateModel((model) => viewObjectMutations.updateViewObject(model, viewId, objectId, patch));
  };

  const deleteViewObject = (viewId: string, objectId: string): void => {
    updateModel((model) => viewObjectMutations.deleteViewObject(model, viewId, objectId));
  };

  const updateViewNodeLayout = (
    viewId: string,
    elementId: string,
    patch: Partial<Omit<ViewNodeLayout, 'elementId'>>
  ): void => {
    updateModel((model) => layoutMutations.updateViewNodeLayout(model, viewId, elementId, patch));
  };

  const addElementToView = (viewId: string, elementId: string): string => {
    let result = elementId;
    updateModel((model) => {
      result = layoutMutations.addElementToView(model, viewId, elementId);
    });
    return result;
  };

  return {
    addView,
    updateView,
    ensureViewConnections,
    includeRelationshipInView,
    hideRelationshipInView,
    showRelationshipInView,
    setViewConnectionRoute,
    setViewConnectionEndpointAnchors,
    upsertViewTaggedValue,
    removeViewTaggedValue,
    updateViewFormatting,
    cloneView,
    deleteView,
    addViewObject,
    createViewObjectInViewAt,
    updateViewObject,
    deleteViewObject,
    updateViewNodeLayout,
    addElementToView,
  };
};

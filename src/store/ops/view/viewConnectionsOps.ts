import type {
  ViewConnectionRouteKind,
  ViewConnectionAnchorSide,
} from '../../../domain';
import { materializeViewConnectionsForView } from '../../../domain';
import type { ViewOpsDeps } from './viewOpsTypes';

export const createViewConnectionsOps = (deps: ViewOpsDeps) => {
  const { updateModel } = deps;

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

  return {
    ensureViewConnections,
    setViewConnectionRoute,
    setViewConnectionEndpointAnchors,
  };
};

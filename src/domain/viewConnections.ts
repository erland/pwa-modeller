import type { Model, View, ViewConnection, ViewConnectionEndpointRef, Relationship } from './types';
import { createId } from './id';

function keyOf(ref: ViewConnectionEndpointRef): string {
  return `${ref.kind}:${ref.id}`;
}

function endpointRefForRelationship(rel: Relationship, side: 'source' | 'target'): ViewConnectionEndpointRef | null {
  if (side === 'source') {
    if (typeof rel.sourceElementId === 'string') return { kind: 'element', id: rel.sourceElementId };
    if (typeof rel.sourceConnectorId === 'string') return { kind: 'connector', id: rel.sourceConnectorId };
    return null;
  }
  if (typeof rel.targetElementId === 'string') return { kind: 'element', id: rel.targetElementId };
  if (typeof rel.targetConnectorId === 'string') return { kind: 'connector', id: rel.targetConnectorId };
  return null;
}

/**
 * Returns the relationship ids that are considered "visible" in a view under the current
 * implicit-relationship rendering rules:
 * - both endpoints must exist as nodes in the view layout
 */
export function computeVisibleRelationshipIdsForView(model: Model, view: View): string[] {
  const layout = view.layout;
  if (!layout || !Array.isArray(layout.nodes) || layout.nodes.length === 0) return [];

  const nodeSet = new Set<string>();
  for (const n of layout.nodes) {
    if (typeof n.elementId === 'string') nodeSet.add(`element:${n.elementId}`);
    if (typeof n.connectorId === 'string') nodeSet.add(`connector:${n.connectorId}`);
  }

  // Explicit mode: only include relationship ids explicitly listed on the view.
  if (view.relationshipVisibility?.mode === 'explicit') {
    const raw = Array.isArray(view.relationshipVisibility.relationshipIds)
      ? view.relationshipVisibility.relationshipIds
      : [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const id of raw) {
      if (!id || typeof id !== 'string') continue;
      if (seen.has(id)) continue;
      const rel = model.relationships[id];
      if (!rel) continue;
      const s = endpointRefForRelationship(rel, 'source');
      const t = endpointRefForRelationship(rel, 'target');
      if (!s || !t) continue;
      if (!nodeSet.has(keyOf(s)) || !nodeSet.has(keyOf(t))) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }

  // Implicit mode (default): include all model relationships whose endpoints exist as nodes in the view.
  const ids: string[] = [];
  for (const rel of Object.values(model.relationships)) {
    const s = endpointRefForRelationship(rel, 'source');
    const t = endpointRefForRelationship(rel, 'target');
    if (!s || !t) continue;
    if (!nodeSet.has(keyOf(s)) || !nodeSet.has(keyOf(t))) continue;
    ids.push(rel.id);
  }
  return ids;
}

/**
 * Materialize per-view ViewConnection instances to match the set of relationships currently
 * considered visible in the view (based on layout nodes and semantic relationships).
 *
 * - Keeps existing connections (by relationshipId) when possible
 * - Creates missing connections with default route.kind = "orthogonal"
 * - Prunes connections that no longer correspond to a visible relationship
 */
export function materializeViewConnectionsForView(model: Model, view: View): ViewConnection[] {
  const visibleIds = computeVisibleRelationshipIdsForView(model, view);

  const existing: ViewConnection[] = Array.isArray(view.connections) ? view.connections : [];
  const existingByRel = new Map<string, ViewConnection>();
  for (const c of existing) {
    if (c && typeof c.relationshipId === 'string') existingByRel.set(c.relationshipId, c);
  }

  const next: ViewConnection[] = [];

  for (const relId of visibleIds) {
    const rel = model.relationships[relId];
    if (!rel) continue;

    const sourceRef = endpointRefForRelationship(rel, 'source');
    const targetRef = endpointRefForRelationship(rel, 'target');
    if (!sourceRef || !targetRef) continue;

    const prev = existingByRel.get(relId);
    if (prev) {
      next.push({
        ...prev,
        viewId: view.id,
        relationshipId: relId,
        source: prev.source ?? sourceRef,
        target: prev.target ?? targetRef,
        route: prev.route?.kind ? prev.route : { kind: 'orthogonal' },
      });
    } else {
      next.push({
        id: createId('vc'),
        viewId: view.id,
        relationshipId: relId,
        source: sourceRef,
        target: targetRef,
        route: { kind: 'orthogonal' },
      });
    }
  }

  // Optionally keep any existing connections that refer to a visible relationship but were not
  // included above (shouldn't happen, but defensive) — already handled via visibleIds ordering.
  // Also drop connections that reference non-visible relationships (implicit rendering rule).
  // (Kept as a comment for clarity.)

  // Preserve order of visibleIds; this keeps rendering stable across runs.
  // We do not include any connections whose relationship is missing or invisible.
  return next;
}

/**
 * Ensure all views in the model have up-to-date materialized connections.
 * Mutates the provided model (by replacing view objects) and returns it for convenience.
 */
export function ensureModelViewConnections(model: Model): Model {
  for (const vid of Object.keys(model.views)) {
    const v = model.views[vid];
    if (!v) continue;
    const nextConnections = materializeViewConnectionsForView(model, v);
    // Only replace if changed to reduce churn.
    if (nextConnections !== v.connections) {
      model.views[vid] = { ...v, connections: nextConnections };
    }
  }
  return model;
}
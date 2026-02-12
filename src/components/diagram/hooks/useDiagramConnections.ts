import { useMemo } from 'react';
import type { Model, View, ViewNodeLayout } from '../../../domain';
import type { ConnectableRef } from '../connectable';
import { refKey } from '../connectable';
import type { Point } from '../geometry';
import {
  distancePointToPolyline,
  nodeRefFromLayout,
  offsetPolyline,
  rectAlignedOrthogonalAnchorsWithEndpointAnchors,
  unitPerp,
} from '../geometry';
import { applyLaneOffsetsSafely } from '../connectionLanes';
import { getConnectionPath } from '../connectionPath';
import { orthogonalRoutingHintsFromAnchors } from '../orthogonalHints';
import { adjustOrthogonalConnectionEndpoints } from '../adjustConnectionEndpoints';
import type { ConnectionRenderItem } from '../layers/DiagramRelationshipsLayer';

type HitItem = { relationshipId: string; connectionId: string; points: Point[] };

type Args = {
  model: Model | null;
  activeView: View | null;
  nodes: ViewNodeLayout[];
};

/**
 * Derives connection render items and precomputed polylines (for hit-testing) for the active view.
 *
 * This is intentionally UI-layer (it knows about ViewConnections/materialization) but is still
 * pure (memoized) and independent of React rendering concerns.
 */
export function useDiagramConnections({ model, activeView, nodes }: Args) {
  // Connections to render come from the view (ViewConnection), materialized on load/import.
  const connectionRenderItems: ConnectionRenderItem[] = useMemo(() => {
    if (!model || !activeView) return [];

    // Build a lookup of current view nodes by their connectable ref key.
    const nodeByKey = new Map<string, ViewNodeLayout>();
    for (const n of nodes) {
      const r = nodeRefFromLayout(n);
      if (r) nodeByKey.set(refKey(r), n);
    }

    // Group connections by unordered (A,B) endpoint pair so parallel lines are drawn
    // when multiple relationships exist between the same two nodes.
    const groups = new Map<string, typeof activeView.connections>();

    for (const conn of activeView.connections ?? []) {
      if (!model.relationships[conn.relationshipId]) continue;
      const a = refKey(conn.source as unknown as ConnectableRef);
      const b = refKey(conn.target as unknown as ConnectableRef);
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      const list = groups.get(key) ?? [];
      list.push(conn);
      groups.set(key, list);
    }

    const items: ConnectionRenderItem[] = [];
    for (const [groupKey, conns] of groups.entries()) {
      const stable = [...conns].sort((x, y) => x.id.localeCompare(y.id));
      for (let i = 0; i < stable.length; i += 1) {
        const conn = stable[i];
        const s = nodeByKey.get(refKey(conn.source as unknown as ConnectableRef));
        const t = nodeByKey.get(refKey(conn.target as unknown as ConnectableRef));
        if (!s || !t) continue;
        items.push({ connection: conn, source: s, target: t, indexInGroup: i, totalInGroup: stable.length, groupKey });
      }
    }

    return items;
  }, [model, activeView, nodes]);

  // Precompute connection polylines in model coordinates for hit-testing (select tool).
  const connectionHitItems: HitItem[] = useMemo(() => {
    if (!model || !activeView) return [];
    const items: HitItem[] = [];
    const obstaclesById = new Map<string, Array<{ x: number; y: number; w: number; h: number }>>();

    for (const item of connectionRenderItems) {
      const conn = item.connection;
      const rel = model.relationships[conn.relationshipId];
      if (!rel) continue;

      const s = item.source;
      const t = item.target;

      const sc: Point = { x: s.x + (s.width ?? 120) / 2, y: s.y + (s.height ?? 60) / 2 };
      const tc: Point = { x: t.x + (t.width ?? 120) / 2, y: t.y + (t.height ?? 60) / 2 };
      const { start, end } = rectAlignedOrthogonalAnchorsWithEndpointAnchors(s, t, conn.sourceAnchor, conn.targetAnchor);

      // Include obstacle rectangles (other nodes) so the orthogonal auto-router can shift channels.
      const nodeRect = (n: ViewNodeLayout) => {
        const isConnector = Boolean(n.connectorId);
        const w = n.width ?? (isConnector ? 24 : 120);
        const h = n.height ?? (isConnector ? 24 : 60);
        return { x: n.x, y: n.y, w, h };
      };
      const sKey = refKey(nodeRefFromLayout(s)!);
      const tKey = refKey(nodeRefFromLayout(t)!);
      const isSelf = sKey === tKey;
      const obstacles = nodes
        .filter((n) => {
          const r = nodeRefFromLayout(n);
          if (!r) return false;
          const k = refKey(r);
          return k !== sKey && k !== tKey;
        })
        .map(nodeRect);

      const selfBounds = isSelf ? nodeRect(s) : undefined;

      obstaclesById.set(conn.id, obstacles);

      const gridSize = activeView.formatting?.gridSize;
      const hints = {
        ...orthogonalRoutingHintsFromAnchors(s, start, t, end, gridSize),
        obstacles,
        obstacleMargin: gridSize ? gridSize / 2 : 10,
        selfLoop: isSelf,
        selfBounds,
      };
      let points: Point[] = getConnectionPath(conn, { a: start, b: end, hints }).points;

      if (conn.route.kind === 'orthogonal') {
        points = adjustOrthogonalConnectionEndpoints(points, s, t, { stubLength: gridSize ? gridSize / 2 : 10 });
      }

      const total = item.totalInGroup;
      if (total > 1) {
        const spacing = 14;
        const offsetIndex = item.indexInGroup - (total - 1) / 2;
        const offset = offsetIndex * spacing;

        const parts = item.groupKey.split('|');
        const aNode = nodes.find((n) => {
          const r = nodeRefFromLayout(n);
          return r ? refKey(r) === parts[0] : false;
        });
        const bNode = nodes.find((n) => {
          const r = nodeRefFromLayout(n);
          return r ? refKey(r) === parts[1] : false;
        });
        const aC: Point | null = aNode ? { x: aNode.x + (aNode.width ?? 120) / 2, y: aNode.y + (aNode.height ?? 60) / 2 } : null;
        const bC: Point | null = bNode ? { x: bNode.x + (bNode.width ?? 120) / 2, y: bNode.y + (bNode.height ?? 60) / 2 } : null;
        const perp = aC && bC ? unitPerp(aC, bC) : unitPerp(sc, tc);
        points = offsetPolyline(points, perp, offset);
      }

      items.push({ relationshipId: conn.relationshipId, connectionId: conn.id, points });
    }

    // Apply cheap lane offsets consistently with rendering/export.
    const adjusted = applyLaneOffsetsSafely(
      items.map((it) => ({ id: it.connectionId, points: it.points })),
      {
        gridSize: activeView.formatting?.gridSize,
        obstaclesById,
        obstacleMargin: activeView.formatting?.gridSize ? activeView.formatting?.gridSize / 2 : 10,
      }
    );
    const byId = new Map<string, Point[]>();
    for (const a of adjusted) byId.set(a.id, a.points);

    return items.map((it) => ({ ...it, points: byId.get(it.connectionId) ?? it.points }));
  }, [model, activeView, connectionRenderItems, nodes]);

  return { connectionRenderItems, connectionHitItems };
}

export function findNearestConnectionHit(
  p: Point,
  hitItems: HitItem[]
): { best: HitItem | null; bestDist: number } {
  let best: HitItem | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const item of hitItems) {
    const d = distancePointToPolyline(p, item.points);
    if (d < bestDist) {
      bestDist = d;
      best = item;
    }
  }
  return { best, bestDist };
}

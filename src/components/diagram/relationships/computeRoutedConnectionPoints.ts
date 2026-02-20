import type { Model, ViewConnection, ViewNodeLayout } from '../../../domain';
import type { Point } from '../geometry';
import {
  nodeRefFromLayout,
  offsetPolyline,
  rectAlignedOrthogonalAnchorsWithEndpointAnchors,
  unitPerp,
} from '../geometry';
import { getConnectionPath } from '../connectionPath';
import { applyLaneOffsetsSafely } from '../connectionLanes';
import { orthogonalRoutingHintsFromAnchors } from '../orthogonalHints';
import { adjustOrthogonalConnectionEndpoints } from '../adjustConnectionEndpoints';
import { refKey } from '../connectable';

export type ConnectionRenderItem = {
  connection: ViewConnection;
  source: ViewNodeLayout;
  target: ViewNodeLayout;
  indexInGroup: number;
  totalInGroup: number;
  groupKey: string;
};

type Rect = { x: number; y: number; w: number; h: number };

function nodeRect(n: ViewNodeLayout): Rect {
  const isConnector = Boolean(n.connectorId);
  const w = n.width ?? (isConnector ? 24 : 120);
  const h = n.height ?? (isConnector ? 24 : 60);
  return { x: n.x, y: n.y, w, h };
}

/**
 * Computes routed polylines for all connections.
 *
 * Extracted from DiagramRelationshipsLayer to keep React rendering thin and to make
 * routing computations easier to test and evolve.
 */
export function computeRoutedConnectionPoints(args: {
  model: Model;
  nodes: ViewNodeLayout[];
  connectionRenderItems: ConnectionRenderItem[];
  gridSize?: number;
}): Map<string, Point[]> {
  const { model, nodes, connectionRenderItems, gridSize } = args;

  const laneItems: Array<{ id: string; points: Point[] }> = [];
  const obstaclesById = new Map<string, Rect[]>();

  for (const item of connectionRenderItems) {
    const conn = item.connection;
    const rel = model.relationships[conn.relationshipId];
    if (!rel) continue;

    const s = item.source;
    const t = item.target;
    const sc: Point = { x: s.x + (s.width ?? 120) / 2, y: s.y + (s.height ?? 60) / 2 };
    const tc: Point = { x: t.x + (t.width ?? 120) / 2, y: t.y + (t.height ?? 60) / 2 };

    const { start, end } = rectAlignedOrthogonalAnchorsWithEndpointAnchors(s, t, conn.sourceAnchor, conn.targetAnchor);

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

    const hints = {
      ...orthogonalRoutingHintsFromAnchors(s, start, t, end, gridSize),
      obstacles,
      obstacleMargin: gridSize ? gridSize / 2 : 10,
      selfLoop: isSelf,
      selfBounds,
    };

    let points: Point[] = getConnectionPath(conn, { a: start, b: end, hints }).points;

    // If the router decided to start/end with an axis that doesn't match the original anchors,
    // snap endpoints to the implied node edges so the connection doesn't appear to "start from"
    // an unexpected side (e.g. horizontal segment starting at the top edge).
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

      const aC: Point | null = aNode
        ? { x: aNode.x + (aNode.width ?? 120) / 2, y: aNode.y + (aNode.height ?? 60) / 2 }
        : null;
      const bC: Point | null = bNode
        ? { x: bNode.x + (bNode.width ?? 120) / 2, y: bNode.y + (bNode.height ?? 60) / 2 }
        : null;

      const perp = aC && bC ? unitPerp(aC, bC) : unitPerp(sc, tc);
      points = offsetPolyline(points, perp, offset);
    }

    laneItems.push({ id: conn.id, points });
  }

  const adjusted = applyLaneOffsetsSafely(laneItems, {
    gridSize,
    obstaclesById,
    obstacleMargin: gridSize ? gridSize / 2 : 10,
  });

  const map = new Map<string, Point[]>();
  for (const it of adjusted) map.set(it.id, it.points);
  return map;
}

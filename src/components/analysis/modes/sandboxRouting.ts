import type { ViewNodeLayout } from '../../../domain';

import type { SandboxNode } from '../workspace/controller/sandboxTypes';

import type { Point } from '../../diagram/geometry';
import { rectAlignedOrthogonalAnchorsWithEndpointAnchors } from '../../diagram/geometry';
import { orthogonalRoutingHintsFromAnchors } from '../../diagram/orthogonalHints';
import { adjustOrthogonalConnectionEndpoints } from '../../diagram/adjustConnectionEndpoints';
import { getConnectionPath } from '../../diagram/connectionPath';
import { applyLaneOffsetsSafely } from '../../diagram/connectionLanes';

import type { SandboxRenderableRelationship } from './SandboxEdgesLayer';

function layoutForSandboxNode(n: SandboxNode, nodeW: number, nodeH: number): ViewNodeLayout {
  return { elementId: n.elementId, x: n.x, y: n.y, width: nodeW, height: nodeH };
}

/**
 * Compute orthogonal polyline points for sandbox relationships.
 *
 * This is intentionally a pure, non-React module so it can be unit tested and reused.
 */
export function computeSandboxOrthogonalPointsByRelationshipId({
  nodes,
  renderedRelationships,
  nodeW,
  nodeH,
  gridSize,
}: {
  nodes: SandboxNode[];
  renderedRelationships: SandboxRenderableRelationship[];
  nodeW: number;
  nodeH: number;
  gridSize: number;
}): Map<string, Point[]> {
  if (renderedRelationships.length === 0) return new Map<string, Point[]>();

  const layoutsByElementId = new Map<string, ViewNodeLayout>();
  for (const n of nodes) {
    layoutsByElementId.set(n.elementId, layoutForSandboxNode(n, nodeW, nodeH));
  }

  const obstacleRects: Array<{ id: string; x: number; y: number; w: number; h: number }> = nodes.map((n) => ({
    id: n.elementId,
    x: n.x,
    y: n.y,
    w: nodeW,
    h: nodeH,
  }));

  const laneItems: Array<{ id: string; points: Point[] }> = [];
  const obstaclesById = new Map<string, Array<{ x: number; y: number; w: number; h: number }>>();

  for (const r of renderedRelationships) {
    const sId = r.sourceElementId;
    const tId = r.targetElementId;
    const s = layoutsByElementId.get(sId);
    const t = layoutsByElementId.get(tId);
    if (!s || !t) continue;

    const { start, end } = rectAlignedOrthogonalAnchorsWithEndpointAnchors(s, t);

    const obstacles = obstacleRects
      .filter((o) => o.id !== sId && o.id !== tId)
      .map(({ x, y, w, h }) => ({ x, y, w, h }));

    obstaclesById.set(r.id, obstacles);

    const hints = {
      ...orthogonalRoutingHintsFromAnchors(s, start, t, end, gridSize),
      obstacles,
      obstacleMargin: gridSize / 2,
      laneSpacing: gridSize / 2,
      maxChannelShiftSteps: 10,
    };

    let points = getConnectionPath({ route: { kind: 'orthogonal' }, points: undefined }, { a: start, b: end, hints }).points;
    points = adjustOrthogonalConnectionEndpoints(points, s, t, { stubLength: gridSize / 2 });
    laneItems.push({ id: r.id, points });
  }

  const adjusted = applyLaneOffsetsSafely(laneItems, {
    gridSize,
    obstaclesById,
    obstacleMargin: gridSize / 2,
  });

  const map = new Map<string, Point[]>();
  for (const it of adjusted) map.set(it.id, it.points);
  return map;
}

import type { ViewNodeLayout } from '../../domain';
import type { OrthogonalRoutingAxis, OrthogonalRoutingDir, OrthogonalRoutingHints } from './connectionPath';
import type { Point } from './geometry';

function nodeSize(n: ViewNodeLayout): { w: number; h: number } {
  // Keep these defaults in sync with diagram rendering/export.
  const isConnector = Boolean((n as any).connectorId);
  const w = n.width ?? (isConnector ? 24 : 120);
  const h = n.height ?? (isConnector ? 24 : 60);
  return { w, h };
}

/**
 * Infer preferred axis for the first/last segment based on where the anchor sits on the node rectangle.
 * - Left/Right edges => horizontal ('h')
 * - Top/Bottom edges => vertical ('v')
 *
 * If the anchor is near a corner (close to both a horizontal and a vertical edge), returns undefined to
 * avoid over-constraining the router.
 */
export function inferPreferredAxisFromAnchor(node: ViewNodeLayout, anchor: Point, eps = 2): OrthogonalRoutingAxis | undefined {
  const { w, h } = nodeSize(node);
  const left = node.x;
  const right = node.x + w;
  const top = node.y;
  const bottom = node.y + h;

  const nearLeft = Math.abs(anchor.x - left) <= eps;
  const nearRight = Math.abs(anchor.x - right) <= eps;
  const nearTop = Math.abs(anchor.y - top) <= eps;
  const nearBottom = Math.abs(anchor.y - bottom) <= eps;

  const nearHorizontalEdge = nearLeft || nearRight;
  const nearVerticalEdge = nearTop || nearBottom;

  // Corner: don't force an axis preference.
  if (nearHorizontalEdge && nearVerticalEdge) return undefined;
  if (nearHorizontalEdge) return 'h';
  if (nearVerticalEdge) return 'v';

  // Fallback: choose the nearest edge.
  const dl = Math.abs(anchor.x - left);
  const dr = Math.abs(anchor.x - right);
  const dt = Math.abs(anchor.y - top);
  const db = Math.abs(anchor.y - bottom);
  const min = Math.min(dl, dr, dt, db);
  if (min === dl || min === dr) return 'h';
  return 'v';
}

/**
 * Infer the outward direction at an anchor point located on a node rectangle.
 *
 * Cardinal directions are in model coordinates where Y increases downward:
 * - Left edge => W, Right edge => E
 * - Top edge => N, Bottom edge => S
 *
 * If near a corner (close to two edges), returns undefined to avoid over-constraining.
 */
export function inferPreferredDirFromAnchor(node: ViewNodeLayout, anchor: Point, eps = 2): OrthogonalRoutingDir | undefined {
  const { w, h } = nodeSize(node);
  const left = node.x;
  const right = node.x + w;
  const top = node.y;
  const bottom = node.y + h;

  const nearLeft = Math.abs(anchor.x - left) <= eps;
  const nearRight = Math.abs(anchor.x - right) <= eps;
  const nearTop = Math.abs(anchor.y - top) <= eps;
  const nearBottom = Math.abs(anchor.y - bottom) <= eps;

  const nearHorizontalEdge = nearLeft || nearRight;
  const nearVerticalEdge = nearTop || nearBottom;

  // Corner: don't force a direction preference.
  if (nearHorizontalEdge && nearVerticalEdge) return undefined;
  if (nearLeft) return 'W';
  if (nearRight) return 'E';
  if (nearTop) return 'N';
  if (nearBottom) return 'S';

  // Fallback: choose the nearest edge.
  const dl = Math.abs(anchor.x - left);
  const dr = Math.abs(anchor.x - right);
  const dt = Math.abs(anchor.y - top);
  const db = Math.abs(anchor.y - bottom);
  const min = Math.min(dl, dr, dt, db);
  if (min === dl) return 'W';
  if (min === dr) return 'E';
  if (min === dt) return 'N';
  return 'S';
}

/**
 * Compute stubbed start/end points, offset from the anchor points in their preferred directions.
 *
 * This is intended for grid routers that want to start routing *outside* the node boundary.
 * If a direction is not provided, the corresponding anchor is returned unchanged.
 */
export function computeStubbedEndpoints(
  startAnchor: Point,
  endAnchor: Point,
  hints?: Pick<OrthogonalRoutingHints, 'startDir' | 'endDir' | 'stubLength' | 'gridSize'>
): { startOutside: Point; endOutside: Point } {
  const stub = hints?.stubLength ?? hints?.gridSize ?? 8;

  const offset = (p: Point, dir?: OrthogonalRoutingDir): Point => {
    switch (dir) {
      case 'N':
        return { x: p.x, y: p.y - stub };
      case 'S':
        return { x: p.x, y: p.y + stub };
      case 'E':
        return { x: p.x + stub, y: p.y };
      case 'W':
        return { x: p.x - stub, y: p.y };
      default:
        return p;
    }
  };

  return {
    startOutside: offset(startAnchor, hints?.startDir),
    endOutside: offset(endAnchor, hints?.endDir),
  };
}

export function orthogonalRoutingHintsFromAnchors(
  source: ViewNodeLayout,
  sourceAnchor: Point,
  target: ViewNodeLayout,
  targetAnchor: Point,
  gridSize?: number
): OrthogonalRoutingHints {
  return {
    preferStartAxis: inferPreferredAxisFromAnchor(source, sourceAnchor),
    preferEndAxis: inferPreferredAxisFromAnchor(target, targetAnchor),
    startDir: inferPreferredDirFromAnchor(source, sourceAnchor),
    endDir: inferPreferredDirFromAnchor(target, targetAnchor),
    // For now, keep this as a hint only; routers can override.
    stubLength: gridSize,
    gridSize,
  };
}

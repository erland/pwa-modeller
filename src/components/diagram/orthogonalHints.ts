import type { ViewNodeLayout } from '../../domain';
import type { OrthogonalRoutingAxis, OrthogonalRoutingHints } from './connectionPath';
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
    gridSize,
  };
}

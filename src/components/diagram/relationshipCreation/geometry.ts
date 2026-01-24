import type { Model } from '../../../domain';
import type { ViewNodeLayout } from '../../../domain';

type Rect = { x: number; y: number; w: number; h: number; elementId: string };

function rectForNode(node: ViewNodeLayout): Rect {
  return { x: node.x, y: node.y, w: node.width ?? 120, h: node.height ?? 60, elementId: node.elementId! };
}

function centerOf(r: Rect): { cx: number; cy: number } {
  return { cx: r.x + r.w / 2, cy: r.y + r.h / 2 };
}

function contains(r: Rect, cx: number, cy: number): boolean {
  return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h;
}

function pickSmallestContaining(rs: Rect[], cx: number, cy: number): Rect | null {
  let best: Rect | null = null;
  let bestArea = Number.POSITIVE_INFINITY;
  for (const r of rs) {
    if (!contains(r, cx, cy)) continue;
    const area = r.w * r.h;
    if (area < bestArea) {
      best = r;
      bestArea = area;
    }
  }
  return best;
}

/**
 * Best-effort BPMN helper: determine the Pool element containing the given element (or itself if it's a Pool),
 * based on current view layout geometry.
 *
 * Used for UX hints (Message Flow vs Sequence Flow) during relationship creation.
 */
export function poolIdForElementInBpmnView(model: Model, viewId: string, elementId: string): string | null {
  const view = model.views[viewId];
  if (!view || view.kind !== 'bpmn') return null;
  const nodes = view.layout?.nodes;
  if (!nodes?.length) return null;

  const el = model.elements[elementId];
  if (!el) return null;
  if (String(el.type) === 'bpmn.pool') return elementId;

  const node = nodes.find((n) => n.elementId === elementId);
  if (!node?.elementId) return null;

  const poolRects: Rect[] = [];
  for (const n of nodes) {
    if (!n.elementId) continue;
    const t = model.elements[n.elementId]?.type;
    if (String(t) === 'bpmn.pool') poolRects.push(rectForNode(n));
  }
  if (!poolRects.length) return null;

  const r = rectForNode(node);
  const { cx, cy } = centerOf(r);
  const pool = pickSmallestContaining(poolRects, cx, cy);
  return pool?.elementId ?? null;
}

import type { AlignMode, Model, ViewNodeLayout } from '../../domain';
import { getView } from './helpers';
import { syncViewConnections } from './layout/syncViewConnections';

function getNodeSize(n: ViewNodeLayout): { w: number; h: number } {
  // Elements should always have explicit sizes, but keep safe fallbacks.
  return { w: n.width ?? 120, h: n.height ?? 60 };
}

type NodeInfo = {
  elementId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  locked: boolean;
};

/**
 * Align selected element nodes within a view.
 *
 * - Only moves element-backed view nodes.
 * - Locked nodes are never moved, but still participate in the alignment reference.
 */
export function alignViewElements(model: Model, viewId: string, elementIds: string[], mode: AlignMode): void {
  if (elementIds.length === 0) return;

  const view = getView(model, viewId);
  const layout = view.layout;
  if (!layout) return;

  const idSet = new Set(elementIds);
  const selected: NodeInfo[] = [];

  for (const n of layout.nodes) {
    if (!n.elementId) continue;
    if (!idSet.has(n.elementId)) continue;
    const { w, h } = getNodeSize(n);
    selected.push({ elementId: n.elementId, x: n.x, y: n.y, w, h, locked: Boolean((n as { locked?: boolean }).locked) });
  }

  if (selected.length <= 1) return;

  // Compute selection bounds.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of selected) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.w);
    maxY = Math.max(maxY, n.y + n.h);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return;

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const nextNodes = layout.nodes.map((n) => {
    if (!n.elementId) return n;
    if (!idSet.has(n.elementId)) return n;

    const info = selected.find((s) => s.elementId === n.elementId);
    if (!info) return n;
    if (info.locked) return n;

    const { w, h } = getNodeSize(n);
    let x = n.x;
    let y = n.y;

    switch (mode) {
      case 'left':
        x = minX;
        break;
      case 'center':
        x = Math.round(centerX - w / 2);
        break;
      case 'right':
        x = Math.round(maxX - w);
        break;
      case 'top':
        y = minY;
        break;
      case 'middle':
        y = Math.round(centerY - h / 2);
        break;
      case 'bottom':
        y = Math.round(maxY - h);
        break;
    }

    if (x === n.x && y === n.y) return n;
    return { ...n, x, y };
  });

  model.views[viewId] = { ...view, layout: { ...layout, nodes: nextNodes } };
  syncViewConnections(model, viewId);
}

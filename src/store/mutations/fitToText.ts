import type { Model } from '../../domain';
import { getView } from './helpers';
import { syncViewConnections } from './layout/syncViewConnections';

export type FitToTextUpdate = { elementId: string; width: number; height: number };

/**
 * Apply already-computed sizes to element nodes in a view.
 *
 * Kept separate from measurement to keep this mutation deterministic and testable.
 */
export function applyViewElementSizes(model: Model, viewId: string, updates: FitToTextUpdate[]): void {
  if (updates.length === 0) return;

  const view = getView(model, viewId);
  const layout = view.layout;
  if (!layout) return;

  const map = new Map<string, { width: number; height: number }>();
  for (const u of updates) {
    if (!u.elementId) continue;
    map.set(u.elementId, { width: u.width, height: u.height });
  }
  if (map.size === 0) return;

  let changed = false;
  const nextNodes = layout.nodes.map((n) => {
    if (!n.elementId) return n;
    const next = map.get(n.elementId);
    if (!next) return n;
    const prevW = n.width ?? 120;
    const prevH = n.height ?? 60;
    if (prevW === next.width && prevH === next.height) return n;
    changed = true;
    return { ...n, width: next.width, height: next.height };
  });

  if (!changed) return;
  model.views[viewId] = { ...view, layout: { ...layout, nodes: nextNodes } };
  syncViewConnections(model, viewId);
}

import type { LayoutOutput } from '../types';

/**
 * Snap a set of node positions to a grid.
 *
 * - Uses Math.round for a natural "nearest grid point" feel.
 * - Optionally keeps positions for fixed ids unchanged.
 */
export function snapToGrid(
  positions: LayoutOutput['positions'],
  gridSize: number,
  fixedIds: ReadonlySet<string> = new Set()
): LayoutOutput['positions'] {
  if (!gridSize || gridSize <= 1) return { ...positions };

  const out: LayoutOutput['positions'] = {};
  for (const [id, pos] of Object.entries(positions)) {
    if (fixedIds.has(id)) {
      out[id] = { x: pos.x, y: pos.y };
      continue;
    }
    out[id] = {
      x: Math.round(pos.x / gridSize) * gridSize,
      y: Math.round(pos.y / gridSize) * gridSize
    };
  }
  return out;
}

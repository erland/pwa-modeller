import type { LayoutOutput } from '../types';

export type NudgeNode = {
  id: string;
  w: number;
  h: number;
};

export type NudgeOptions = {
  padding?: number;
  fixedIds?: ReadonlySet<string>;
  /** Safety cap to prevent infinite loops on pathological input. */
  maxIterations?: number;
};

type Rect = { x: number; y: number; w: number; h: number };

function rectOf(node: NudgeNode, pos: { x: number; y: number }): Rect {
  return { x: pos.x, y: pos.y, w: node.w, h: node.h };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Simple deterministic overlap resolution.
 *
 * Strategy:
 * - Walk nodes in stable order.
 * - If a movable node overlaps any already-placed node, shift it to the right
 *   of the blocking rectangle (plus padding) and re-check.
 *
 * This is intentionally "small and safe"; it improves readability without trying
 * to be a full packing algorithm.
 */
export function nudgeOverlaps(
  nodes: ReadonlyArray<NudgeNode>,
  positions: LayoutOutput['positions'],
  options: NudgeOptions = {}
): LayoutOutput['positions'] {
  const padding = options.padding ?? 10;
  const fixedIds = options.fixedIds ?? new Set<string>();
  const maxIterations = options.maxIterations ?? 2000;

  // Only consider nodes we have positions for.
  const present = nodes
    .filter((n) => Boolean(positions[n.id]))
    .map((n) => ({ ...n, w: Math.max(1, n.w), h: Math.max(1, n.h) }));

  // Stable order: y, then x, then id.
  present.sort((a, b) => {
    const pa = positions[a.id];
    const pb = positions[b.id];
    if (pa.y !== pb.y) return pa.y - pb.y;
    if (pa.x !== pb.x) return pa.x - pb.x;
    return a.id.localeCompare(b.id);
  });

  const out: LayoutOutput['positions'] = { ...positions };
  const placed: { id: string; rect: Rect }[] = [];

  for (const node of present) {
    const start = out[node.id];
    if (!start) continue;

    // Fixed nodes are accepted as-is, but still block later nodes.
    if (fixedIds.has(node.id)) {
      placed.push({ id: node.id, rect: rectOf(node, start) });
      continue;
    }

    let x = start.x;
    let y = start.y;
    let iterations = 0;

    while (iterations++ < maxIterations) {
      const r = rectOf(node, { x, y });
      const blocker = placed.find((p) => overlaps(r, p.rect));
      if (!blocker) break;

      // Shift to the right of the blocker.
      x = blocker.rect.x + blocker.rect.w + padding;
    }

    out[node.id] = { x, y };
    placed.push({ id: node.id, rect: rectOf(node, { x, y }) });
  }

  return out;
}

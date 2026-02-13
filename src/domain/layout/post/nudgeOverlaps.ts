import type { LayoutOutput } from '../types';

export type NudgeNode = {
  id: string;
  w: number;
  h: number;
};

export type NudgeOptions = {
  padding?: number;
  fixedIds?: ReadonlySet<string>;
  /**
   * Resolution mode:
   * - 'x'  : only shift along X (keeps rows/bands stable)
   * - 'xy' : allow shifting along X or Y (better for dense free-form views)
   */
  mode?: 'x' | 'xy';
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
  const mode = options.mode ?? 'x';

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

      // Candidate moves.
      // Always include "right"; optionally consider "down" and "up".
      const candidates: { x: number; y: number; tag: 'right' | 'down' | 'up' }[] = [
        { x: blocker.rect.x + blocker.rect.w + padding, y, tag: 'right' },
      ];
      if (mode === 'xy') {
        candidates.push(
          { x, y: blocker.rect.y + blocker.rect.h + padding, tag: 'down' },
          { x, y: blocker.rect.y - node.h - padding, tag: 'up' }
        );
      }

      // Pick the candidate that causes the fewest overlaps with already placed nodes.
      // Tie-breaker: smallest movement; then deterministic tag priority.
      const tagPriority: Record<string, number> = { right: 0, down: 1, up: 2 };

      let best = candidates[0];
      let bestOverlaps = Number.POSITIVE_INFINITY;
      let bestMove = Number.POSITIVE_INFINITY;
      let bestTag = Number.POSITIVE_INFINITY;

      for (const c of candidates) {
        const rr = rectOf(node, { x: c.x, y: c.y });
        const count = placed.reduce((acc, p) => acc + (overlaps(rr, p.rect) ? 1 : 0), 0);
        const move = Math.abs(c.x - x) + Math.abs(c.y - y);
        const pri = tagPriority[c.tag];

        if (
          count < bestOverlaps ||
          (count === bestOverlaps && move < bestMove) ||
          (count === bestOverlaps && move === bestMove && pri < bestTag)
        ) {
          best = c;
          bestOverlaps = count;
          bestMove = move;
          bestTag = pri;
        }
      }

      x = best.x;
      y = best.y;
    }

    out[node.id] = { x, y };
    placed.push({ id: node.id, rect: rectOf(node, { x, y }) });
  }

  return out;
}

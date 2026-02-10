import type { Rect } from './types';

export function rectContains(container: Rect, inner: Rect): boolean {
  return (
    inner.x >= container.x &&
    inner.y >= container.y &&
    inner.x + inner.width <= container.x + container.width &&
    inner.y + inner.height <= container.y + container.height
  );
}

export function centerOf(r: Rect): { x: number; y: number } {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

export function keyFor(r: Rect): string {
  return `${r.x},${r.y},${r.width},${r.height}`;
}

export function smallestContaining(
  rects: { id: string; rect: Rect; prio: number }[],
  inner: Rect
): Rect | undefined {
  const matches = rects.filter((x) => rectContains(x.rect, inner));
  if (matches.length === 0) return undefined;
  // Smallest area wins. If ties, prefer higher-priority container types.
  matches.sort((a, b) => {
    const aa = a.rect.width * a.rect.height;
    const ba = b.rect.width * b.rect.height;
    if (aa !== ba) return aa - ba;
    if (a.prio !== b.prio) return a.prio - b.prio;
    return a.id.localeCompare(b.id);
  });
  return matches[0].rect;
}

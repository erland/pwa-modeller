import { findBestOrthogonalRouteBetweenRects, type Rect } from './orthogonalPathfinder';

function segIntersectsRect(a: { x: number; y: number }, b: { x: number; y: number }, r: Rect): boolean {
  // axis aligned
  if (a.x === b.x) {
    const x = a.x;
    const y1 = Math.min(a.y, b.y);
    const y2 = Math.max(a.y, b.y);
    if (x < r.x || x > r.x + r.w) return false;
    return y2 >= r.y && y1 <= r.y + r.h;
  }
  if (a.y === b.y) {
    const y = a.y;
    const x1 = Math.min(a.x, b.x);
    const x2 = Math.max(a.x, b.x);
    if (y < r.y || y > r.y + r.h) return false;
    return x2 >= r.x && x1 <= r.x + r.w;
  }
  return false;
}

function polylineHits(points: Array<{ x: number; y: number }>, obstacles: Rect[]): boolean {
  for (let i = 0; i < points.length - 1; i += 1) {
    for (const o of obstacles) {
      if (segIntersectsRect(points[i], points[i + 1], o)) return true;
    }
  }
  return false;
}

describe('orthogonalPathfinder', () => {
  test('finds a detour around a blocking obstacle', () => {
    const sourceRect: Rect = { x: 0, y: 0, w: 20, h: 20 };
    const targetRect: Rect = { x: 120, y: 0, w: 20, h: 20 };
    const obstacle: Rect = { x: 50, y: -10, w: 40, h: 40 };

    const route = findBestOrthogonalRouteBetweenRects({
      sourceRect,
      targetRect,
      obstacles: [obstacle],
      options: { gridSize: 10, clearance: 4, stubLength: 10 },
    });

    expect(route).not.toBeNull();
    expect(route!.points.length).toBeGreaterThanOrEqual(4);
    // Ensure it doesn't go through the obstacle (inflation already included in router; this is a basic sanity check).
    expect(polylineHits(route!.points, [obstacle])).toBe(false);
  });

  test('prefers fewer bends even if slightly longer', () => {
    const sourceRect: Rect = { x: 0, y: 0, w: 20, h: 20 };
    const targetRect: Rect = { x: 120, y: 80, w: 20, h: 20 };

    // Two obstacles create a choice:
    // - A short zig-zag route with extra bends
    // - A longer route that goes around the outside with fewer bends
    const obstacles: Rect[] = [
      { x: 40, y: 0, w: 20, h: 90 },
      { x: 70, y: 30, w: 20, h: 90 },
    ];

    const route = findBestOrthogonalRouteBetweenRects({
      sourceRect,
      targetRect,
      obstacles,
      options: { gridSize: 10, clearance: 4, stubLength: 10 },
    });

    expect(route).not.toBeNull();
    // The exact number depends on side choice, but it should not explode.
    expect(route!.bends).toBeLessThanOrEqual(3);
  });

  test('chooses a better side pair when one side is blocked', () => {
    const sourceRect: Rect = { x: 0, y: 40, w: 20, h: 20 };
    const targetRect: Rect = { x: 120, y: 40, w: 20, h: 20 };

    // Block the direct horizontal corridor at y ~ 50
    const obstacle: Rect = { x: 30, y: 35, w: 80, h: 30 };

    const route = findBestOrthogonalRouteBetweenRects({
      sourceRect,
      targetRect,
      obstacles: [obstacle],
      options: { gridSize: 10, clearance: 4, stubLength: 10 },
    });

    expect(route).not.toBeNull();
    // It should avoid going straight through the obstacle and pick a top/bottom detour.
    expect(polylineHits(route!.points, [obstacle])).toBe(false);
  });
});

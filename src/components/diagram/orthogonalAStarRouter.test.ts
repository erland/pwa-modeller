import { routeOrthogonalAStar } from './orthogonalAStarRouter';
import type { Point } from './geometry';

function isOrthogonal(points: Point[]): boolean {
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (!((dx === 0 && dy !== 0) || (dy === 0 && dx !== 0))) return false;
  }
  return true;
}

function bendCount(points: Point[]): number {
  if (points.length < 3) return 0;
  let bends = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const c = points[i + 1];
    const abH = a.y === b.y;
    const bcH = b.y === c.y;
    if (abH !== bcH) bends += 1;
  }
  return bends;
}

function maxY(points: Point[]): number {
  return points.reduce((m, p) => Math.max(m, p.y), Number.NEGATIVE_INFINITY);
}


function pathLength(points: Point[]): number {
  let len = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    len += Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
  }
  return len;
}

describe('orthogonalAStarRouter', () => {
  test('routes around a blocking rectangle (basic obstacle avoidance)', () => {
    const start = { x: 0, y: 0 };
    const end = { x: 40, y: 0 };
    // Block the straight horizontal corridor at y=0 between x=10..30.
    // Also block the "top" detour so only a single (bottom) route is attractive.
    const obstacles = [
      { x: 10, y: -5, w: 20, h: 10 }, // blocks y=0
      { x: 10, y: -25, w: 20, h: 10 } // blocks y=-20
    ];

    const pts = routeOrthogonalAStar({ start, end, gridSize: 10, obstacles, obstacleMargin: 0, bendPenalty: 5 });
    expect(pts[0]).toEqual(start);
    expect(pts[pts.length - 1]).toEqual(end);
    expect(isOrthogonal(pts)).toBe(true);

    // The only reasonable route is via y=20 (downwards is positive in our model space).
    expect(maxY(pts)).toBeGreaterThanOrEqual(10);
  });

  test('bend penalty can prefer a longer-but-straighter detour', () => {
    const start = { x: 0, y: 0 };
    const end = { x: 60, y: 0 };

    // This test is intentionally constructed so there are essentially *two* viable routes:
    //
    // A) A shorter "snake" route in the upper half (y<=30) with many bends.
    // B) A longer "detour" route that drops down to y=80 and then goes straight across (few bends).
    //
    // We achieve this by blocking almost every grid point in the routing bounds except points along
    // the intended snake corridor and the detour corridor. This makes the test stable (no accidental
    // third route via tie-breaks, obstacle boundary quirks, etc.).
    //
    // NOTE: In our model space, +y is "down".
    const gridSize = 10;
    const bounds = { minX: 0, minY: 0, maxX: 60, maxY: 80 };

    // IMPORTANT: The snake corridor is designed to *not* overlap the detour corridor
    // (x=0 column, y=80 row, x=60 column) except at the endpoints. This prevents
    // accidental third routes formed by mixing corridor segments.
    //
    // The snake is shorter (fewer grid steps) but has many bends.
    const snakeCorridor: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 10 },
      { x: 20, y: 20 },
      { x: 30, y: 20 },
      { x: 30, y: 30 },
      { x: 40, y: 30 },
      { x: 40, y: 40 },
      { x: 50, y: 40 },
      // Return down to y=0 without using the x=60 column.
      { x: 50, y: 30 },
      { x: 50, y: 20 },
      { x: 50, y: 10 },
      { x: 50, y: 0 },
      { x: 60, y: 0 }
    ];

    const allowed = new Set<string>();
    const allow = (p: Point) => allowed.add(`${p.x},${p.y}`);
    for (const p of snakeCorridor) allow(p);

    // Allow the detour corridor at y=80.
    for (let x = bounds.minX; x <= bounds.maxX; x += gridSize) {
      allow({ x, y: 80 });
    }
    // Allow vertical access down/up at x=0 and x=60 for the detour corridor.
    // (Snake corridor is intentionally not using these columns, to avoid corridor mixing.)
    for (let y = bounds.minY; y <= bounds.maxY; y += gridSize) {
      allow({ x: 0, y });
      allow({ x: 60, y });
    }

    // Block every other grid point in the bounds by adding "point obstacles" (w=0,h=0).
    // The router's blocked-check is point-based, so this is the most direct way to create a stable
    // corridor-style test fixture.
    const obstacles: { x: number; y: number; w: number; h: number }[] = [];
    for (let y = bounds.minY; y <= bounds.maxY; y += gridSize) {
      for (let x = bounds.minX; x <= bounds.maxX; x += gridSize) {
        if (allowed.has(`${x},${y}`)) continue;
        obstacles.push({ x, y, w: 0, h: 0 });
      }
    }

    const snake = routeOrthogonalAStar({ start, end, gridSize, obstacles, obstacleMargin: 0, bendPenalty: 0, bounds });
    const detour = routeOrthogonalAStar({ start, end, gridSize, obstacles, obstacleMargin: 0, bendPenalty: 50, bounds });

    expect(isOrthogonal(snake)).toBe(true);
    expect(isOrthogonal(detour)).toBe(true);

    // Both are valid: start/end must match.
    expect(snake[0]).toEqual(start);
    expect(snake[snake.length - 1]).toEqual(end);
    expect(detour[0]).toEqual(start);
    expect(detour[detour.length - 1]).toEqual(end);

    // The snake corridor stays shallow (at most y=40), while the detour corridor must reach y=80.
    expect(maxY(snake)).toBeLessThanOrEqual(40);
    expect(maxY(detour)).toBeGreaterThanOrEqual(80);

    // High bend penalty should reduce bends, even if the route is longer.
    expect(bendCount(detour)).toBeLessThan(bendCount(snake));
    expect(pathLength(detour)).toBeGreaterThan(pathLength(snake));
  });

  test('respects start/end direction constraints', () => {
    const start = { x: 0, y: 0 };
    const end = { x: 40, y: 40 };
    const pts = routeOrthogonalAStar({
      start,
      end,
      gridSize: 10,
      obstacles: [],
      obstacleMargin: 0,
      bendPenalty: 5,
      startDir: 'E',
      endDir: 'S'
    });

    expect(pts[0]).toEqual(start);
    expect(pts[pts.length - 1]).toEqual(end);
    expect(isOrthogonal(pts)).toBe(true);

    // First segment must go East.
    expect(pts.length).toBeGreaterThanOrEqual(2);
    expect(pts[1].y).toBe(0);
    expect(pts[1].x).toBeGreaterThan(0);

    // Last segment must go South (increasing y).
    expect(pts.length).toBeGreaterThanOrEqual(2);
    const a = pts[pts.length - 2];
    const b = pts[pts.length - 1];
    expect(b.x).toBe(a.x);
    expect(b.y).toBeGreaterThan(a.y);
  });

  test('is deterministic for identical inputs', () => {
    const start = { x: 0, y: 0 };
    const end = { x: 40, y: 0 };
    const obstacles = [{ x: 10, y: -5, w: 20, h: 10 }];
    const opts = { start, end, gridSize: 10, obstacles, obstacleMargin: 0, bendPenalty: 5 } as const;

    const a = routeOrthogonalAStar(opts);
    const b = routeOrthogonalAStar(opts);
    expect(a).toEqual(b);
  });
});

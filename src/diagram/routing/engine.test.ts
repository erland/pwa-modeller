import { connectionPolylinePoints, type Point } from './engine';

function segmentIntersectsRect(a: Point, b: Point, r: { x: number; y: number; w: number; h: number }): boolean {
  const x0 = r.x;
  const x1 = r.x + r.w;
  const y0 = r.y;
  const y1 = r.y + r.h;

  // Vertical segment
  if (a.x === b.x && a.y !== b.y) {
    const x = a.x;
    const yMin = Math.min(a.y, b.y);
    const yMax = Math.max(a.y, b.y);
    if (x < x0 || x > x1) return false;
    return yMax >= y0 && yMin <= y1;
  }

  // Horizontal segment
  if (a.y === b.y && a.x !== b.x) {
    const y = a.y;
    const xMin = Math.min(a.x, b.x);
    const xMax = Math.max(a.x, b.x);
    if (y < y0 || y > y1) return false;
    return xMax >= x0 && xMin <= x1;
  }

  // Non-axis aligned segments are not expected from the orthogonal router; treat as intersecting conservatively.
  return true;
}

function polylineIntersectsRect(points: Point[], r: { x: number; y: number; w: number; h: number }): boolean {
  for (let i = 0; i < points.length - 1; i += 1) {
    if (segmentIntersectsRect(points[i], points[i + 1], r)) return true;
  }
  return false;
}

describe('diagram routing engine', () => {
  test('legacy default (no hints, no obstacles) uses vertical-then-horizontal L', () => {
    const a: Point = { x: 0, y: 0 };
    const b: Point = { x: 100, y: 100 };

    const pts = connectionPolylinePoints('orthogonal', a, b, undefined, undefined);

    expect(pts).toEqual([a, { x: a.x, y: b.y }, b]);
  });

  test('preferStartAxis=h tends to choose horizontal-then-vertical L', () => {
    const a: Point = { x: 0, y: 0 };
    const b: Point = { x: 100, y: 100 };

    const pts = connectionPolylinePoints('orthogonal', a, b, undefined, {
      preferStartAxis: 'h',
      gridSize: 20,
    });

    expect(pts).toEqual([a, { x: b.x, y: a.y }, b]);
  });

  test('with obstacles provided, routing avoids blocked L corner when possible', () => {
    const a: Point = { x: 0, y: 0 };
    const b: Point = { x: 100, y: 100 };

    // Blocks the vertical segment of the legacy route (x=0, y from 0..100)
    const obstacle = { x: -5, y: 40, w: 10, h: 20 };

    const pts = connectionPolylinePoints('orthogonal', a, b, undefined, {
      gridSize: 20,
      obstacles: [obstacle],
      obstacleMargin: 0,
    });

    // Should not pick the legacy L through the obstacle
    expect(pts).not.toEqual([a, { x: a.x, y: b.y }, b]);
    expect(polylineIntersectsRect(pts, obstacle)).toBe(false);
  });
});

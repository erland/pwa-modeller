import { adjustOrthogonalConnectionEndpoints } from '../adjustConnectionEndpoints';

import type { ViewNodeLayout } from '../../../domain';
import type { Point } from '../geometry';

function expectOrthogonal(points: Point[]): void {
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    expect(Number.isFinite(a.x)).toBe(true);
    expect(Number.isFinite(a.y)).toBe(true);
    expect(Number.isFinite(b.x)).toBe(true);
    expect(Number.isFinite(b.y)).toBe(true);
    expect(a.x === b.x || a.y === b.y).toBe(true);
  }
}

describe('adjustOrthogonalConnectionEndpoints', () => {
  const source: ViewNodeLayout = { elementId: 's', x: 0, y: 0, width: 100, height: 50 };
  const target: ViewNodeLayout = { elementId: 't', x: 200, y: 0, width: 100, height: 50 };

  test('snaps endpoints to implied edges and adds vertical stubs', () => {
    // First segment is vertical up from the source, last is vertical down into the target.
    const points: Point[] = [
      { x: 50, y: 0 },
      { x: 50, y: -5 },
      { x: 250, y: -5 },
      { x: 250, y: 0 }
    ];

    const out = adjustOrthogonalConnectionEndpoints(points, source, target, { stubLength: 10 });

    // Start should be on the top edge of the source.
    expect(out[0]).toEqual({ x: 50, y: 0 });
    // Stub should extend above the source by at least 10.
    expect(out.some((p) => p.x === 50 && p.y === -10)).toBe(true);
    // End should be on the top edge of the target (approaching from above).
    expect(out[out.length - 1]).toEqual({ x: 250, y: 0 });
    // Approach stub should exist above the target.
    expect(out.some((p) => p.x === 250 && p.y === -10)).toBe(true);

    expectOrthogonal(out);
  });

  test('snaps to right/left edges and adds horizontal stubs', () => {
    const points: Point[] = [
      { x: 0, y: 25 },
      { x: 5, y: 25 },
      { x: 195, y: 25 },
      { x: 200, y: 25 }
    ];

    const out = adjustOrthogonalConnectionEndpoints(points, source, target, { stubLength: 10 });

    // Start snapped to the right edge of the source.
    expect(out[0]).toEqual({ x: 100, y: 25 });
    // There should be a start stub extending outwards.
    expect(out.some((p) => p.y === 25 && p.x >= 110)).toBe(true);
    // End snapped to the left edge of the target.
    expect(out[out.length - 1]).toEqual({ x: 200, y: 25 });
    // There should be an approach stub to the left of the target.
    // (Exact x depends on how far out the path already is; we just require it to be at least
    // stubLength away from the target edge.)
    expect(out.slice(0, -1).some((p) => p.y === 25 && p.x <= 190)).toBe(true);

    expectOrthogonal(out);
  });

  test('is defensive for short/overlapping paths (no NaNs, stays orthogonal)', () => {
    const overlappingSource: ViewNodeLayout = { elementId: 's', x: 0, y: 0, width: 100, height: 50 };
    const overlappingTarget: ViewNodeLayout = { elementId: 't', x: 20, y: 10, width: 100, height: 50 };

    // Keep this path orthogonal even when snapping collapses bend points.
    const points: Point[] = [
      { x: 50, y: 25 },
      { x: 50, y: 26 },
      { x: 50, y: 27 }
    ];

    const out = adjustOrthogonalConnectionEndpoints(points, overlappingSource, overlappingTarget, { stubLength: 10 });
    expect(out.length).toBeGreaterThanOrEqual(2);
    expectOrthogonal(out);
  });
});

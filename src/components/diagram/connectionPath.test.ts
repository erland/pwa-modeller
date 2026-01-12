import { __testOnly_shortcutOrthogonalPolyline, getConnectionPath } from './connectionPath';

describe('connectionPath', () => {
  test('straight route produces a simple line path and unit end tangent', () => {
    const res = getConnectionPath({ route: { kind: 'straight' }, points: undefined }, { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } });

    expect(res.points).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
    expect(res.d).toBe('M 0 0 L 10 0');
    expect(res.endTangent).toEqual({ x: 1, y: 0 });
    expect(res.midPoint).toEqual({ x: 5, y: 0 });
  });

  test('orthogonal route auto-routes with a single 90-degree bend', () => {
    const res = getConnectionPath({ route: { kind: 'orthogonal' }, points: undefined }, { a: { x: 0, y: 0 }, b: { x: 10, y: 10 } });

    expect(res.points).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 10 },
    ]);
    expect(res.d).toBe('M 0 0 L 0 10 L 10 10');
    // End tangent is along the final segment (horizontal to the right).
    expect(res.endTangent).toEqual({ x: 1, y: 0 });
    // Midpoint is at the bend (equal manhattan segment lengths).
    expect(res.midPoint).toEqual({ x: 0, y: 10 });
  });

  test('orthogonal auto-route does not add a bend when already aligned', () => {
    const res = getConnectionPath({ route: { kind: 'orthogonal' }, points: undefined }, { a: { x: 2, y: 3 }, b: { x: 2, y: 20 } });
    expect(res.points).toEqual([
      { x: 2, y: 3 },
      { x: 2, y: 20 },
    ]);
    expect(res.d).toBe('M 2 3 L 2 20');
    expect(res.endTangent).toEqual({ x: 0, y: 1 });
  });

  test('orthogonal auto-route detours when aligned but blocked by obstacles', () => {
    const res = getConnectionPath(
      { route: { kind: 'orthogonal' }, points: undefined },
      {
        // Keep endpoints on the routing grid to avoid endpoint-bridging affecting the assertions.
        a: { x: 0, y: 0 },
        b: { x: 0, y: 20 },
        hints: {
          gridSize: 10,
          obstacleMargin: 0,
          // An obstacle square centered on the straight corridor.
          obstacles: [{ x: 0, y: 8, w: 6, h: 4 }],
        },
      }
    );

    // Should detour away from x=0 to get around the obstacle.
    expect(res.points.length).toBeGreaterThanOrEqual(3);
    expect(res.points[0]).toEqual({ x: 0, y: 0 });
    expect(res.points[res.points.length - 1]).toEqual({ x: 0, y: 20 });
    expect(res.points.some((p) => p.x !== 0)).toBe(true);

    // Ensure every segment is axis-aligned.
    for (let i = 0; i < res.points.length - 1; i += 1) {
      const p = res.points[i];
      const q = res.points[i + 1];
      expect(p.x === q.x || p.y === q.y).toBe(true);
    }
  });

  test('orthogonal route respects explicit bend points when present', () => {
    const res = getConnectionPath(
      { route: { kind: 'orthogonal' }, points: [{ x: 5, y: 0 }, { x: 5, y: 10 }] },
      { a: { x: 0, y: 0 }, b: { x: 10, y: 10 } }
    );

    expect(res.points).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 10 },
      { x: 10, y: 10 },
    ]);
    expect(res.d).toBe('M 0 0 L 5 0 L 5 10 L 10 10');
    expect(res.endTangent).toEqual({ x: 1, y: 0 });
  });

  test('orthogonal auto-route can prefer horizontal start and end by choosing a 3-segment route', () => {
    const res = getConnectionPath(
      { route: { kind: 'orthogonal' }, points: undefined },
      { a: { x: 0, y: 0 }, b: { x: 10, y: 10 }, hints: { preferStartAxis: 'h', preferEndAxis: 'h', gridSize: 5 } }
    );

    // A 2-segment L cannot be horizontal at both ends, so we expect a 3-segment Z route.
    expect(res.points.length).toBe(4);
    // First segment must be horizontal.
    expect(res.points[0].y).toBe(res.points[1].y);
    // Last segment must be horizontal.
    expect(res.points[res.points.length - 2].y).toBe(res.points[res.points.length - 1].y);
  });

  test('orthogonal auto-route shifts its channel to avoid obstacles', () => {
    const res = getConnectionPath(
      { route: { kind: 'orthogonal' }, points: undefined },
      {
        a: { x: 0, y: 0 },
        b: { x: 10, y: 10 },
        hints: {
          preferStartAxis: 'h',
          preferEndAxis: 'h',
          gridSize: 5,
          obstacleMargin: 0,
          // Obstacle intersects the default vertical channel at x=5 (y-range only in the middle).
          obstacles: [{ x: 4.5, y: 4, w: 1, h: 2 }],
        },
      }
    );

    expect(res.points.length).toBeGreaterThanOrEqual(3);

    // The obstacle blocks the grid point (5,5), so the route should not pass through it.
    expect(res.points.some((p) => p.x === 5 && p.y === 5)).toBe(false);

    // Ensure every segment is axis-aligned.
    for (let i = 0; i < res.points.length - 1; i += 1) {
      const p = res.points[i];
      const q = res.points[i + 1];
      expect(p.x === q.x || p.y === q.y).toBe(true);
    }
  });

  test('orthogonal auto-route can prefer a horizontal first segment with a 2-segment route', () => {
    const res = getConnectionPath(
      { route: { kind: 'orthogonal' }, points: undefined },
      { a: { x: 0, y: 0 }, b: { x: 10, y: 10 }, hints: { preferStartAxis: 'h' } }
    );

    // With only a start preference, a 2-segment L can satisfy it.
    expect(res.points).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
  });

  test('orthogonal auto-route can prefer a vertical last segment with a 2-segment route', () => {
    const res = getConnectionPath(
      { route: { kind: 'orthogonal' }, points: undefined },
      { a: { x: 0, y: 0 }, b: { x: 10, y: 10 }, hints: { preferEndAxis: 'v' } }
    );

    // A 2-segment L can satisfy a vertical end by choosing horizontal-then-vertical.
    expect(res.points).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
  });

  test('orthogonal auto-route is deterministic for identical inputs (no route jitter)', () => {
    const endpoints = {
      a: { x: 0, y: 0 },
      b: { x: 10, y: 10 },
      hints: {
        preferStartAxis: 'h' as const,
        preferEndAxis: 'h' as const,
        gridSize: 5,
        obstacleMargin: 0,
        // Block the default vertical channel at x=5 and also block the symmetric alternative at x=2.5,
        // so the router must deterministically pick the remaining clear channel at x=7.5.
        obstacles: [
          { x: 4.5, y: 4, w: 1, h: 2 },
          { x: 2.0, y: -1, w: 1.0, h: 20 },
        ],
      },
    };

    const r1 = getConnectionPath({ route: { kind: 'orthogonal' }, points: undefined }, endpoints);
    const r2 = getConnectionPath({ route: { kind: 'orthogonal' }, points: undefined }, endpoints);

    expect(r1.points).toEqual(r2.points);
    expect(r1.d).toBe(r2.d);

    // Sanity: ensure the result is an orthogonal polyline from a -> b.
    expect(r1.points.length).toBeGreaterThanOrEqual(2);
    expect(r1.points[0]).toEqual(endpoints.a);
    expect(r1.points[r1.points.length - 1]).toEqual(endpoints.b);

    // And ensure every segment is axis-aligned.
    for (let i = 0; i < r1.points.length - 1; i += 1) {
      const p = r1.points[i];
      const q = r1.points[i + 1];
      expect(p.x === q.x || p.y === q.y).toBe(true);
    }
  });

  test('post-pass shortcut collapses a simple staircase into a clean L when clear', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 20 },
      { x: 20, y: 20 },
      { x: 20, y: 30 },
    ];

    const simplified = __testOnly_shortcutOrthogonalPolyline(points, [], 0);

    // Endpoints must be preserved.
    expect(simplified[0]).toEqual({ x: 0, y: 0 });
    expect(simplified[simplified.length - 1]).toEqual({ x: 20, y: 30 });

    // Should collapse the staircase down to a small number of segments.
    // With endpoint stubs protected, we may keep a short terminal segment near the target.
    expect(simplified.length).toBeGreaterThanOrEqual(3);
    expect(simplified.length).toBeLessThanOrEqual(4);

    // Ensure every segment is axis-aligned.
    for (let i = 0; i < simplified.length - 1; i += 1) {
      const p = simplified[i];
      const q = simplified[i + 1];
      expect(p.x === q.x || p.y === q.y).toBe(true);
    }

    // Expect an "L-ish" shape: start vertical then horizontal, and (optionally) a short final vertical stub.
    expect(simplified[1].x).toBe(0);
    if (simplified.length === 4) {
      // Last hop should be a vertical stub into the end.
      expect(simplified[simplified.length - 2].x).toBe(20);
    }
  });

  test('post-pass shortcut will not cut through an obstacle even if it reduces bends', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 20 },
      { x: 20, y: 20 },
      { x: 20, y: 30 },
    ];

    // Block the direct vertical shortcut x=0, y=0..30, but keep the original staircase clear.
    const obstacles = [{ x: -2, y: 12, w: 4, h: 18 }];
    const out = __testOnly_shortcutOrthogonalPolyline(points, obstacles, 0);

    // Ensure no produced segment intersects the obstacle.
    const r = obstacles[0];
    const x0 = r.x;
    const x1 = r.x + r.w;
    const y0 = r.y;
    const y1 = r.y + r.h;
    for (let i = 0; i < out.length - 1; i += 1) {
      const a = out[i];
      const b = out[i + 1];
      if (a.x === b.x && a.y !== b.y) {
        const x = a.x;
        const ymin = Math.min(a.y, b.y);
        const ymax = Math.max(a.y, b.y);
        expect(x >= x0 && x <= x1 && ymax >= y0 && ymin <= y1).toBe(false);
      } else if (a.y === b.y && a.x !== b.x) {
        const y = a.y;
        const xmin = Math.min(a.x, b.x);
        const xmax = Math.max(a.x, b.x);
        expect(y >= y0 && y <= y1 && xmax >= x0 && xmin <= x1).toBe(false);
      }
    }
  });
});

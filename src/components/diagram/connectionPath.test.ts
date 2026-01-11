import { getConnectionPath } from './connectionPath';

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
        a: { x: 2, y: 0 },
        b: { x: 2, y: 20 },
        hints: {
          gridSize: 10,
          obstacleMargin: 0,
          // An obstacle square centered on the straight corridor.
          obstacles: [{ x: 0, y: 8, w: 6, h: 4 }],
        },
      }
    );

    // Should promote to a 3-segment route with a shifted vertical channel.
    expect(res.points.length).toBe(4);
    expect(res.points[1].x).not.toBe(2);
    expect(res.points[1].x).toBe(res.points[2].x);
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

    expect(res.points.length).toBe(4);
    // Middle segment is vertical at some x != 5 (shifted away from the obstacle).
    expect(res.points[1].x).not.toBe(5);
    expect(res.points[1].x).toBe(res.points[2].x);
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
});

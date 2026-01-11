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
});

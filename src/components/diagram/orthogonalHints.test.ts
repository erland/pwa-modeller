import { computeStubbedEndpoints, inferPreferredAxisFromAnchor, inferPreferredDirFromAnchor, orthogonalRoutingHintsFromAnchors } from './orthogonalHints';

describe('orthogonalHints', () => {
  const node = { x: 100, y: 200, width: 40, height: 30 } as any;

  test('infers preferred axis and direction from anchors on edges', () => {
    expect(inferPreferredAxisFromAnchor(node, { x: 100, y: 215 })).toBe('h');
    expect(inferPreferredDirFromAnchor(node, { x: 100, y: 215 })).toBe('W');

    expect(inferPreferredAxisFromAnchor(node, { x: 140, y: 215 })).toBe('h');
    expect(inferPreferredDirFromAnchor(node, { x: 140, y: 215 })).toBe('E');

    expect(inferPreferredAxisFromAnchor(node, { x: 120, y: 200 })).toBe('v');
    expect(inferPreferredDirFromAnchor(node, { x: 120, y: 200 })).toBe('N');

    expect(inferPreferredAxisFromAnchor(node, { x: 120, y: 230 })).toBe('v');
    expect(inferPreferredDirFromAnchor(node, { x: 120, y: 230 })).toBe('S');
  });

  test('corner anchors avoid over-constraining: axis/dir are undefined', () => {
    const n = { x: 0, y: 0, width: 10, height: 10 } as any;
    const corner = { x: 0, y: 0 };
    expect(inferPreferredAxisFromAnchor(n, corner)).toBeUndefined();
    expect(inferPreferredDirFromAnchor(n, corner)).toBeUndefined();
  });

  test('computeStubbedEndpoints offsets anchors along preferred directions', () => {
    const res = computeStubbedEndpoints(
      { x: 0, y: 5 },
      { x: 10, y: 5 },
      { startDir: 'E', endDir: 'W', stubLength: 10 }
    );

    expect(res.startOutside).toEqual({ x: 10, y: 5 });
    expect(res.endOutside).toEqual({ x: 0, y: 5 });
  });

  test('orthogonalRoutingHintsFromAnchors includes port direction + stubLength hint', () => {
    const h = orthogonalRoutingHintsFromAnchors(
      node,
      { x: 100, y: 215 },
      node,
      { x: 140, y: 215 },
      12
    );

    expect(h.startDir).toBe('W');
    expect(h.endDir).toBe('E');
    expect(h.stubLength).toBe(12);
    expect(h.gridSize).toBe(12);
  });
});

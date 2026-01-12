import { rectClosestEdgeAnchor } from './geometry';

function node(x: number, y: number, w = 100, h = 60) {
  return { x, y, width: w, height: h } as any;
}

describe('geometry.rectClosestEdgeAnchor', () => {
  test('diagonal: prefers vertical edge when vertical gap dominates', () => {
    const a = node(200, 100, 100, 60); // minX=200 maxX=300 minY=100 maxY=160
    const b = node(80, 260, 80, 60); // maxX=160 (left), minY=260 (below)
    // gaps: gapX = 200-160=40, gapY = 260-160=100 → vertical dominates
    const p = rectClosestEdgeAnchor(a, b);
    expect(p.y).toBe(160); // bottom edge
    expect(p.x).toBeGreaterThanOrEqual(200);
    expect(p.x).toBeLessThanOrEqual(300);
  });

  test('diagonal: prefers horizontal edge when horizontal gap dominates', () => {
    const a = node(200, 100, 100, 60); // minX=200 maxX=300 minY=100 maxY=160
    const b = node(20, 175, 80, 60); // maxX=100 (left), minY=175 (below)
    // gaps: gapX = 200-100=100, gapY = 175-160=15 → horizontal dominates
    const p = rectClosestEdgeAnchor(a, b);
    expect(p.x).toBe(200); // left edge
    expect(p.y).toBeGreaterThanOrEqual(100);
    expect(p.y).toBeLessThanOrEqual(160);
  });

  test('non-diagonal: uses the facing edge for simple left/right separation', () => {
    const a = node(200, 100, 100, 60);
    const b = node(0, 110, 80, 60); // strictly left, overlaps in Y
    const p = rectClosestEdgeAnchor(a, b);
    expect(p.x).toBe(200);
    expect(p.y).toBeGreaterThanOrEqual(100);
    expect(p.y).toBeLessThanOrEqual(160);
  });
});

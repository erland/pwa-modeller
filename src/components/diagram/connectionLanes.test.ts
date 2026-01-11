import { applyLaneOffsets } from './connectionLanes';

describe('connectionLanes', () => {
  test('applies lane offsets for two polylines sharing same 3-segment corridor', () => {
    const items = [
      {
        id: 'a',
        points: [
          { x: 0, y: 0 },
          { x: 50, y: 0 },
          { x: 50, y: 40 },
          { x: 100, y: 40 },
        ],
      },
      {
        id: 'b',
        points: [
          { x: 0, y: 10 },
          { x: 50, y: 10 },
          { x: 50, y: 60 },
          { x: 100, y: 60 },
        ],
      },
    ];

    const out = applyLaneOffsets(items, { gridSize: 20, laneSpacing: 10 });
    // First item stays on the base corridor (lane 0).
    expect(out[0].points[1].x).toBe(50);
    expect(out[0].points[2].x).toBe(50);
    // Second item gets shifted to a different lane.
    expect(out[1].points[1].x).not.toBe(50);
    expect(out[1].points[2].x).not.toBe(50);
    // Still vertical corridor (x of p1 and p2 equal).
    expect(out[1].points[1].x).toBe(out[1].points[2].x);
  });
});

import { applyLaneOffsets, applyLaneOffsetsSafely } from './connectionLanes';

describe('connectionLanes', () => {
  test('applies lane offsets for two polylines sharing same 3-segment corridor', () => {
    const items = [
      {
        id: 'a',
        targetKey: 't1',
        targetSide: 'left' as const,
        points: [
          // start stub
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 50, y: 0 },
          { x: 50, y: 40 },
          { x: 90, y: 40 },
          // end stub
          { x: 100, y: 40 },
        ],
      },
      {
        id: 'b',
        targetKey: 't1',
        targetSide: 'left' as const,
        points: [
          { x: 0, y: 10 },
          { x: 10, y: 10 },
          { x: 50, y: 10 },
          { x: 50, y: 60 },
          { x: 90, y: 60 },
          { x: 100, y: 60 },
        ],
      },
    ];

    const out = applyLaneOffsets(items, { gridSize: 20, laneSpacing: 10, stubLength: 10 });
    // The middle vertical corridor points (p2 -> p3 in this polyline shape) should get lane-separated.
    // With two items we expect them to split to opposite lanes.
    expect(out[0].points[2].x).not.toBe(50);
    expect(out[0].points[3].x).toBe(out[0].points[2].x);
    expect(out[1].points[2].x).not.toBe(50);
    expect(out[1].points[3].x).toBe(out[1].points[2].x);
    expect(out[0].points[2].x).toBeLessThan(50);
    expect(out[1].points[2].x).toBeGreaterThan(50);
  });

  test('applyLaneOffsetsSafely falls back when lane shift would intersect an obstacle', () => {
    const items = [
      {
        id: 'a',
        targetKey: 't1',
        targetSide: 'left' as const,
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 50, y: 0 },
          { x: 50, y: 40 },
          { x: 90, y: 40 },
          { x: 100, y: 40 },
        ],
      },
      {
        id: 'b',
        targetKey: 't1',
        targetSide: 'left' as const,
        points: [
          { x: 0, y: 10 },
          { x: 10, y: 10 },
          { x: 50, y: 10 },
          { x: 50, y: 60 },
          { x: 90, y: 60 },
          { x: 100, y: 60 },
        ],
      },
    ];

    // A thin obstacle placed where item 'b' would be shifted to (laneSpacing=10 => lane +1 at x=60).
    const obstaclesById = new Map([
      ['b', [{ x: 59, y: 0, w: 2, h: 100 }]],
    ]);

    const out = applyLaneOffsetsSafely(items, {
      gridSize: 20,
      laneSpacing: 10,
      stubLength: 10,
      obstaclesById,
      obstacleMargin: 0,
    });

    // 'a' is allowed to shift to the left lane (x=40).
    expect(out[0].points[2].x).toBe(40);
    // 'b' would normally shift to x=60, but must fall back due to the obstacle.
    expect(out[1].points[2].x).toBe(50);
    expect(out[1].points[3].x).toBe(50);
  });
});

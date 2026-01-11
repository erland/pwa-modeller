import { distancePointToPolyline, distancePointToSegment } from './geometry';

describe('diagram geometry distance helpers', () => {
  test('distancePointToSegment computes perpendicular distance', () => {
    const d = distancePointToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    expect(d).toBeCloseTo(3, 6);
  });

  test('distancePointToPolyline returns the closest segment distance', () => {
    const poly = [
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 10 },
    ];
    const d = distancePointToPolyline({ x: 2, y: 8 }, poly);
    expect(d).toBeCloseTo(2, 6);
  });

  test('distancePointToPolyline handles points near the corner', () => {
    const poly = [
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 10 },
    ];
    const d = distancePointToPolyline({ x: 1, y: 11 }, poly);
    expect(d).toBeCloseTo(1, 6);
  });
});

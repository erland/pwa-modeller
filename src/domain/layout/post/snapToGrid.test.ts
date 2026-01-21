import { snapToGrid } from './snapToGrid';

describe('snapToGrid', () => {
  it('snaps positions to the nearest grid point', () => {
    const out = snapToGrid(
      {
        A: { x: 23, y: 27 },
        B: { x: 44, y: 5 }
      },
      10
    );
    expect(out.A).toEqual({ x: 20, y: 30 });
    expect(out.B).toEqual({ x: 40, y: 10 });
  });

  it('keeps fixed ids unchanged', () => {
    const out = snapToGrid(
      {
        A: { x: 23, y: 27 },
        B: { x: 44, y: 5 }
      },
      10,
      new Set(['A'])
    );
    expect(out.A).toEqual({ x: 23, y: 27 });
    expect(out.B).toEqual({ x: 40, y: 10 });
  });
});

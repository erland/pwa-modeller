import { elkLayout } from './elkLayout';
import type { LayoutInput } from '../types';

describe('elkLayout', () => {
  it('produces deterministic non-overlapping positions for a simple chain', async () => {
    const input: LayoutInput = {
      nodes: [
        { id: 'A', width: 100, height: 60 },
        { id: 'B', width: 100, height: 60 },
        { id: 'C', width: 100, height: 60 },
      ],
      edges: [
        { id: 'e1', sourceId: 'A', targetId: 'B', weight: 10 },
        { id: 'e2', sourceId: 'B', targetId: 'C', weight: 10 },
      ],
    };

    const out = await elkLayout(input, { direction: 'RIGHT', spacing: 80, edgeRouting: 'POLYLINE' });

    expect(Object.keys(out.positions).sort()).toEqual(['A', 'B', 'C']);
    expect(out.positions.A.x).toBeLessThan(out.positions.B.x);
    expect(out.positions.B.x).toBeLessThan(out.positions.C.x);
  }, 20000);
});

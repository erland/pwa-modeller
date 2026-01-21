import { nudgeOverlaps } from './nudgeOverlaps';
import type { NudgeNode } from './nudgeOverlaps';

function rect(node: NudgeNode, pos: { x: number; y: number }) {
  return { x: pos.x, y: pos.y, w: node.w, h: node.h };
}

function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

describe('nudgeOverlaps', () => {
  it('moves movable nodes to remove overlap with earlier placed nodes', () => {
    const nodes: NudgeNode[] = [
      { id: 'A', w: 100, h: 50 },
      { id: 'B', w: 100, h: 50 }
    ];

    const positions = {
      A: { x: 0, y: 0 },
      B: { x: 50, y: 0 }
    };

    const out = nudgeOverlaps(nodes, positions, { padding: 10, fixedIds: new Set(['A']) });

    const rA = rect(nodes[0], out.A);
    const rB = rect(nodes[1], out.B);
    expect(overlaps(rA, rB)).toBe(false);
    expect(out.B.x).toBeGreaterThanOrEqual(110);
  });
});

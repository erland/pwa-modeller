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

  it('in xy mode can choose vertical nudges when x-only would keep colliding', () => {
    const nodes: NudgeNode[] = [
      { id: 'D', w: 100, h: 100 },
      { id: 'A', w: 100, h: 50 },
      { id: 'B', w: 100, h: 50 }
    ];

    // D is slightly above, so it is "earlier" in stable order and acts as a blocker.
    const positions = {
      D: { x: 110, y: -10 },
      A: { x: 0, y: 0 },
      B: { x: 50, y: 0 }
    };

    const out = nudgeOverlaps(nodes, positions, {
      padding: 10,
      fixedIds: new Set(['D', 'A']),
      mode: 'xy'
    });

    const rA = rect(nodes[1], out.A);
    const rB = rect(nodes[2], out.B);
    const rD = rect(nodes[0], out.D);

    expect(overlaps(rA, rB)).toBe(false);
    expect(overlaps(rD, rB)).toBe(false);
    // Should have moved off the original row (up or down) rather than only pushing right.
    expect(out.B.y).not.toBe(0);
  });
});

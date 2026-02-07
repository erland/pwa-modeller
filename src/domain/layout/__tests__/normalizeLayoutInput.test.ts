import { normalizeLayoutInput } from '../normalizeLayoutInput';
import type { LayoutInput } from '../types';

describe('normalizeLayoutInput', () => {
  it('stable-sorts nodes by id and sorts ports within each node (without mutating input)', () => {
    const input: LayoutInput = {
      nodes: [
        {
          id: 'b',
          width: 120,
          height: 80,
          label: 'B',
          ports: [
            { id: 'p2', side: 'S' },
            { id: 'p1', side: 'N' },
          ],
        },
        {
          id: 'a',
          width: 100,
          height: 60,
          label: 'A',
          ports: [{ id: 'x' }],
        },
      ],
      edges: [],
    };

    const originalPortsB = input.nodes[0].ports!;
    const originalNodes = input.nodes;

    const out = normalizeLayoutInput(input);

    // Input is not mutated.
    expect(input.nodes).toBe(originalNodes);
    expect(input.nodes[0].ports).toBe(originalPortsB);
    expect(input.nodes[0].ports!.map((p) => p.id)).toEqual(['p2', 'p1']);

    // Output is normalized deterministically.
    expect(out.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    const outB = out.nodes.find((n) => n.id === 'b')!;
    expect(outB.ports!.map((p) => p.id)).toEqual(['p1', 'p2']);

    // Output should be new arrays/objects.
    expect(out.nodes).not.toBe(input.nodes);
    expect(outB).not.toBe(input.nodes[0]);
    expect(outB.ports).not.toBe(originalPortsB);
  });

  it('stable-sorts edges by (sourceId, targetId, weight desc, id) with weight defaulting to 0', () => {
    const input: LayoutInput = {
      nodes: [
        { id: 'n1', width: 1, height: 1 },
        { id: 'n2', width: 1, height: 1 },
        { id: 'n3', width: 1, height: 1 },
      ],
      edges: [
        // Same (s,t), different weights (undefined treated as 0)
        { id: 'e3', sourceId: 'n1', targetId: 'n2', weight: 1 },
        { id: 'e2', sourceId: 'n1', targetId: 'n2' },
        { id: 'e1', sourceId: 'n1', targetId: 'n2', weight: 10 },
        // Different target
        { id: 'e4', sourceId: 'n1', targetId: 'n3', weight: 999 },
        // Different source
        { id: 'e5', sourceId: 'n0', targetId: 'n9', weight: 0 },
        // Tie-breaker by id when weights equal
        { id: 'e7', sourceId: 'n2', targetId: 'n3', weight: 5 },
        { id: 'e6', sourceId: 'n2', targetId: 'n3', weight: 5 },
      ],
    };

    const out = normalizeLayoutInput(input);
    expect(out.edges.map((e) => e.id)).toEqual([
      // sourceId order
      'e5',
      // n1 -> n2 sorted by weight desc then id
      'e1',
      'e3',
      'e2',
      // n1 -> n3
      'e4',
      // n2 -> n3, tie-breaker by id
      'e6',
      'e7',
    ]);
  });

  it('includes groups when provided and stable-sorts them by id (including empty array)', () => {
    const inputWithGroups: LayoutInput = {
      nodes: [{ id: 'a', width: 1, height: 1 }],
      edges: [],
      groups: [
        { id: 'g2', padding: 10 },
        { id: 'g1', padding: 5 },
      ],
    };

    const out1 = normalizeLayoutInput(inputWithGroups);
    expect(out1.groups!.map((g) => g.id)).toEqual(['g1', 'g2']);
    expect(out1.groups).not.toBe(inputWithGroups.groups);

    const out2 = normalizeLayoutInput({ nodes: [], edges: [], groups: [] });
    expect(out2.groups).toEqual([]);
  });
});

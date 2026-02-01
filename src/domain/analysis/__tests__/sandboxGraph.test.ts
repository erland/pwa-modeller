import { createEmptyModel } from '../../factories';
import type { Relationship } from '../../types';
import { bfsKShortestPaths, bfsShortestPath, buildAdjacency } from '../sandboxGraph';

function rel(id: string, type: string, s: string, t: string): Relationship {
  return {
    id,
    type: type as any,
    sourceElementId: s,
    targetElementId: t,
    taggedValues: [],
    externalIds: []
  } as Relationship;
}

describe('domain analysis sandboxGraph', () => {
  test('buildAdjacency filters by allowed types and builds in/out maps', () => {
    const model = createEmptyModel({ name: 'm' });
    model.relationships = {
      r1: rel('r1', 'Flow', 'a', 'b'),
      r2: rel('r2', 'Trigger', 'b', 'c')
    };

    const adj = buildAdjacency(model, new Set(['Flow']));
    expect(adj.out.get('a')?.map((e) => e.to)).toEqual(['b']);
    expect(adj.in.get('b')?.map((e) => e.to)).toEqual(['a']);
    expect(adj.out.get('b')).toBeUndefined();
    expect(adj.in.get('c')).toBeUndefined();
  });

  test('bfsShortestPath finds the shortest path within maxHops', () => {
    const model = createEmptyModel({ name: 'm' });
    model.relationships = {
      r1: rel('r1', 'X', 's', 'a'),
      r2: rel('r2', 'X', 'a', 't'),
      r3: rel('r3', 'X', 's', 'b'),
      r4: rel('r4', 'X', 'b', 'c'),
      r5: rel('r5', 'X', 'c', 't')
    };

    const adj = buildAdjacency(model, new Set(['X']));
    const p = bfsShortestPath({ startId: 's', targetId: 't', adjacency: adj, direction: 'outgoing', maxHops: 4 });
    expect(p).toEqual(['s', 'a', 't']);

    const tooShort = bfsShortestPath({ startId: 's', targetId: 't', adjacency: adj, direction: 'outgoing', maxHops: 1 });
    expect(tooShort).toBeNull();
  });

  test('bfsShortestPath respects incoming direction', () => {
    const model = createEmptyModel({ name: 'm' });
    model.relationships = {
      r1: rel('r1', 'X', 'a', 'b'),
      r2: rel('r2', 'X', 'b', 'c')
    };
    const adj = buildAdjacency(model, new Set(['X']));

    // Traverse backwards using incoming edges.
    const p = bfsShortestPath({ startId: 'c', targetId: 'a', adjacency: adj, direction: 'incoming', maxHops: 4 });
    expect(p).toEqual(['c', 'b', 'a']);
  });

  test('bfsKShortestPaths returns up to k paths in BFS order and avoids cycles', () => {
    const model = createEmptyModel({ name: 'm' });
    model.relationships = {
      r1: rel('r1', 'X', 's', 'a'),
      r2: rel('r2', 'X', 'a', 't'),
      r3: rel('r3', 'X', 's', 'b'),
      r4: rel('r4', 'X', 'b', 't'),
      r5: rel('r5', 'X', 's', 'c'),
      r6: rel('r6', 'X', 'c', 't'),
      // Cycle edge (should not appear in any returned path)
      r7: rel('r7', 'X', 'a', 's')
    };

    const adj = buildAdjacency(model, new Set(['X']));
    const paths = bfsKShortestPaths({ startId: 's', targetId: 't', adjacency: adj, direction: 'outgoing', maxHops: 3, k: 2 });
    expect(paths.length).toBe(2);
    expect(paths[0]).toEqual(['s', 'a', 't']);
    expect(paths[1]).toEqual(['s', 'b', 't']);
    // no repeated nodes inside any returned path
    for (const p of paths) {
      expect(new Set(p).size).toBe(p.length);
    }
  });
});

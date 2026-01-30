import type { PathsBetweenResult } from '../queries/pathsBetween';
import type { RelatedElementsResult } from '../queries/relatedElements';
import type { TraversalStep } from '../traverse';
import { buildMiniGraphData, MINI_GRAPH_MAX_EDGES, MINI_GRAPH_MAX_NODES } from '../miniGraph';

function step(fromId: string, toId: string, relationshipId: string): TraversalStep {
  // The MiniGraph code only relies on relationshipId/fromId/toId for de-dupe + filtering.
  return {
    relationshipId,
    relationshipType: 'Unknown',
    relationship: {
      id: relationshipId,
      type: 'Unknown',
      sourceElementId: fromId,
      targetElementId: toId,
      taggedValues: [],
      externalIds: []
    },
    fromId,
    toId,
    reversed: false
  } as unknown as TraversalStep;
}

describe('domain analysis miniGraph', () => {
  const labelForId = (id: string) => id;

  test('returns null for related when no hits', () => {
    const related: RelatedElementsResult = { startElementId: 's', hits: [] };
    expect(buildMiniGraphData(labelForId, 'related', related, null)).toBeNull();
  });

  test('caps nodes in related mode and preserves stable ordering', () => {
    const hits = Array.from({ length: 200 }, (_, i) => ({
      elementId: `n${i}`,
      distance: 1 + (i % 5),
      via: step('s', `n${i}`, `r${i}`)
    }));

    const related: RelatedElementsResult = { startElementId: 's', hits };
    const g = buildMiniGraphData(labelForId, 'related', related, null);
    expect(g).not.toBeNull();
    if (!g) return;

    expect(g.trimmed.nodes).toBe(true);
    expect(g.nodes.length).toBe(MINI_GRAPH_MAX_NODES);

    // Start node should always be present at distance 0.
    const start = g.nodes.find((n) => n.id === 's');
    expect(start?.level).toBe(0);

    // Nodes are sorted by level first, then stableName(label,id) in each level.
    const levels = g.nodes.map((n) => n.level);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]).toBeGreaterThanOrEqual(levels[i - 1]);
    }
  });

  test('de-dupes identical edges in related mode', () => {
    const dup = step('a', 'b', 'r1');
    const related: RelatedElementsResult = {
      startElementId: 'a',
      hits: [
        { elementId: 'b', distance: 1, via: dup },
        { elementId: 'b', distance: 1, via: dup }
      ]
    };

    const g = buildMiniGraphData(labelForId, 'related', related, null);
    expect(g).not.toBeNull();
    if (!g) return;

    expect(g.edges.length).toBe(1);
    expect(g.edges[0].relationshipId).toBe('r1');
  });

  test('paths mode assigns level by latest position across paths', () => {
    const paths: PathsBetweenResult = {
      sourceElementId: 's',
      targetElementId: 't',
      paths: [
        { elementIds: ['s', 'a', 't'], steps: [step('s', 'a', 'r1'), step('a', 't', 'r2')] },
        { elementIds: ['s', 'b', 'a', 't'], steps: [step('s', 'b', 'r3'), step('b', 'a', 'r4'), step('a', 't', 'r5')] }
      ]
    };

    const g = buildMiniGraphData(labelForId, 'paths', null, paths);
    expect(g).not.toBeNull();
    if (!g) return;

    const byId = new Map(g.nodes.map((n) => [n.id, n]));
    expect(byId.get('s')?.level).toBe(0);
    // Node levels are assigned by the latest (right-most) position they appear in any path.
    // 'a' appears at index 1 in the first path, and index 2 in the second path.
    expect(byId.get('a')?.level).toBe(2);
    expect(byId.get('b')?.level).toBe(1); // appears at index 1 in second path
    // 't' appears at index 2 in the first path and index 3 in the second path.
    expect(byId.get('t')?.level).toBe(3);
    expect(g.maxLevel).toBeGreaterThanOrEqual(3);
  });

  test('paths mode caps edges (trimmed.edges) when steps exceed limit', () => {
    const nodeIds = Array.from({ length: MINI_GRAPH_MAX_NODES }, (_, i) => `n${i}`);
    const steps = Array.from({ length: MINI_GRAPH_MAX_EDGES + 25 }, (_, i) =>
      step(nodeIds[i % nodeIds.length], nodeIds[(i + 1) % nodeIds.length], `r${i}`)
    );

    const paths: PathsBetweenResult = {
      sourceElementId: nodeIds[0],
      targetElementId: nodeIds[nodeIds.length - 1],
      paths: [{ elementIds: nodeIds, steps }]
    };

    const g = buildMiniGraphData(labelForId, 'paths', null, paths);
    expect(g).not.toBeNull();
    if (!g) return;

    expect(g.trimmed.edges).toBe(true);
    expect(g.edges.length).toBe(MINI_GRAPH_MAX_EDGES);
  });
});

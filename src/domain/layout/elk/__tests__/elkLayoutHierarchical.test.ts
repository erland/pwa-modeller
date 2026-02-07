import { elkLayoutHierarchical } from '../elkLayoutHierarchical';
import type { LayoutInput } from '../../types';

// Mock ELK so tests are deterministic and fast.
let lastGraph: any | undefined;
const layoutMock = jest.fn<Promise<any>, [any]>();

jest.mock('elkjs/lib/elk.bundled.js', () => {
  class MockELK {
    layout = (graph: any) => {
      lastGraph = graph;
      return layoutMock(graph);
    };
  }
  return { __esModule: true, default: MockELK };
});

describe('elkLayoutHierarchical', () => {
  beforeEach(() => {
    lastGraph = undefined;
    layoutMock.mockReset();
  });

  it('builds a layered root graph with sorted children and expected options', async () => {
    const input: LayoutInput = {
      nodes: [
        { id: 'b', width: 10, height: 10 },
        { id: 'a', width: 20, height: 20 }
      ],
      edges: [{ id: 'e1', sourceId: 'b', targetId: 'a', weight: 7 }]
    };

    // Return a trivial layout with absolute positions.
    layoutMock.mockResolvedValueOnce({
      id: 'root',
      children: [
        { id: 'a', x: 100, y: 10 },
        { id: 'b', x: 0, y: 0 }
      ],
      edges: []
    });

    const out = await elkLayoutHierarchical(input, { direction: 'DOWN', edgeRouting: 'ORTHOGONAL', spacing: 90 });

    // Positions are extracted from the laid-out graph.
    expect(out.positions).toEqual({
      a: { x: 100, y: 10 },
      b: { x: 0, y: 0 }
    });

    // Verify what we sent to ELK.
    expect(lastGraph).toBeTruthy();
    expect(lastGraph.id).toBe('root');

    // Sorted by id.
    expect((lastGraph.children ?? []).map((c: any) => c.id)).toEqual(['a', 'b']);

    // Options mapped correctly.
    expect(lastGraph.layoutOptions).toMatchObject({
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': '90',
      'elk.layered.spacing.nodeNodeBetweenLayers': '90'
    });

    // Edge weight mapped to layered priority.
    expect(lastGraph.edges).toEqual([
      {
        id: 'e1',
        sources: ['b'],
        targets: ['a'],
        layoutOptions: { 'elk.layered.priority': '7' }
      }
    ]);
  });

  it('accumulates positions for hierarchical children (parent + child offsets)', async () => {
    const input: LayoutInput = {
      nodes: [
        { id: 'pool', width: 300, height: 200 },
        { id: 'task', width: 80, height: 40, parentId: 'pool' }
      ],
      edges: []
    };

    layoutMock.mockResolvedValueOnce({
      id: 'root',
      children: [
        {
          id: 'pool',
          x: 100,
          y: 50,
          children: [{ id: 'task', x: 10, y: 20 }]
        }
      ],
      edges: []
    });

    const out = await elkLayoutHierarchical(input);
    expect(out.positions.pool).toEqual({ x: 100, y: 50 });
    // Child is relative to parent -> accumulated.
    expect(out.positions.task).toEqual({ x: 110, y: 70 });

    // Containers get padding options on build.
    const poolNode = (lastGraph.children ?? [])[0];
    expect(poolNode.layoutOptions?.['elk.padding']).toContain('top=40');
    expect((poolNode.children ?? []).map((c: any) => c.id)).toEqual(['task']);
  });

  it('extracts edgeRoutes from ELK sections when present', async () => {
    const input: LayoutInput = {
      nodes: [
        { id: 'a', width: 10, height: 10 },
        { id: 'b', width: 10, height: 10 }
      ],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }]
    };

    layoutMock.mockResolvedValueOnce({
      id: 'root',
      children: [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 100, y: 0 }
      ],
      edges: [
        {
          id: 'e1',
          sections: [
            {
              startPoint: { x: 1, y: 2 },
              bendPoints: [
                { x: 3, y: 4 },
                { x: 5, y: 6 }
              ],
              endPoint: { x: 7, y: 8 }
            }
          ]
        }
      ]
    });

    const out = await elkLayoutHierarchical(input);
    expect(out.edgeRoutes).toEqual({
      e1: { points: [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }, { x: 7, y: 8 }] }
    });
  });

  it('rejects if ELK rejects (no internal swallowing)', async () => {
    const input: LayoutInput = { nodes: [], edges: [] };
    layoutMock.mockRejectedValueOnce(new Error('ELK failed'));
    await expect(elkLayoutHierarchical(input)).rejects.toThrow('ELK failed');
  });
});

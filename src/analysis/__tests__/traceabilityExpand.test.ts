import { archimateAnalysisAdapter } from '../adapters/archimate';
import { expandFromNode } from '../traceability/expand';

import type { Model } from '../../domain/types';

function createTestModel(): Model {
  return {
    id: 'm1',
    metadata: { name: 'test' },
    elements: {
      A: { id: 'A', name: 'A', type: 'ApplicationComponent', layer: 'Application' },
      B: { id: 'B', name: 'B', type: 'ApplicationFunction', layer: 'Application' },
      C: { id: 'C', name: 'C', type: 'BusinessProcess', layer: 'Business' }
    },
    relationships: {
      R1: { id: 'R1', sourceElementId: 'A', targetElementId: 'B', type: 'Serving' },
      R2: { id: 'R2', sourceElementId: 'B', targetElementId: 'C', type: 'Flow' },
      // Undirected association between A and B
      R3: { id: 'R3', sourceElementId: 'B', targetElementId: 'A', type: 'Association', attrs: { isDirected: false } }
    },
    views: {},
    folders: {}
  };
}

describe('Traceability expansion', () => {
  test('expands outgoing neighbors with stable ids and frontier', () => {
    const model = createTestModel();

    const patch = expandFromNode(model, archimateAnalysisAdapter, {
      nodeId: 'A',
      direction: 'outgoing',
      depth: 1
    });

    expect(patch.rootNodeId).toBe('A');
    // A -> B via Serving should be included
    expect(patch.addedNodes.map((n) => n.id).sort()).toEqual(['B']);
    expect(patch.addedEdges.map((e) => e.id)).toContain('R1:A->B');
    expect(patch.frontierByNodeId?.B).toEqual(['A']);
  });

  test('relationship type filters exclude edges and nodes', () => {
    const model = createTestModel();

    const patch = expandFromNode(model, archimateAnalysisAdapter, {
      nodeId: 'A',
      direction: 'outgoing',
      depth: 1,
      relationshipTypes: ['Flow']
    });

    expect(patch.addedNodes).toHaveLength(0);
    expect(patch.addedEdges).toHaveLength(0);
  });

  test('stopAtType prevents traversal past a matched node', () => {
    const model = createTestModel();

    const patch = expandFromNode(model, archimateAnalysisAdapter, {
      nodeId: 'A',
      direction: 'outgoing',
      depth: 3,
      stopConditions: {
        stopAtType: ['ApplicationFunction']
      }
    });

    // We should reach B but not expand B -> C
    expect(patch.addedNodes.map((n) => n.id).sort()).toEqual(['B']);
    expect(patch.addedEdges.map((e) => e.id)).toContain('R1:A->B');
    expect(patch.addedEdges.map((e) => e.id)).not.toContain('R2:B->C');
  });
});

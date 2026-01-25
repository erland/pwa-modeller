import { createElement, createEmptyModel, createRelationship } from '../../../factories';
import type { Model } from '../../../types';
import { buildAnalysisGraph } from '../../graph';
import { computeMatrixMetric, computeNodeMetric } from '../index';

function buildSmallModel(): Model {
  const model = createEmptyModel({ name: 't' });

  const a = createElement({ id: 'A', name: 'A', type: 'BusinessActor', layer: 'Business' });
  const b = createElement({ id: 'B', name: 'B', type: 'ApplicationComponent', layer: 'Application' });
  const c = createElement({ id: 'C', name: 'C', type: 'Node', layer: 'Technology' });
  const d = createElement({ id: 'D', name: 'D', type: 'BusinessRole', layer: 'Business' });

  model.elements[a.id] = a;
  model.elements[b.id] = b;
  model.elements[c.id] = c;
  model.elements[d.id] = d;

  // A -> B -> C
  const r1 = createRelationship({ id: 'R1', type: 'Serving', sourceElementId: a.id, targetElementId: b.id });
  const r2 = createRelationship({ id: 'R2', type: 'Flow', sourceElementId: b.id, targetElementId: c.id });

  // Undirected association between A and D
  const r3 = createRelationship({
    id: 'R3',
    type: 'Association',
    sourceElementId: a.id,
    targetElementId: d.id,
    attrs: { isDirected: false }
  });

  model.relationships[r1.id] = r1;
  model.relationships[r2.id] = r2;
  model.relationships[r3.id] = r3;

  return model;
}

describe('analysis metrics', () => {
  test('nodeDegree supports direction and relationship type filtering', () => {
    const model = buildSmallModel();
    const graph = buildAnalysisGraph(model);

    const outgoing = computeNodeMetric(graph, 'nodeDegree', { direction: 'outgoing' });
    expect(outgoing).toMatchObject({ A: 2, B: 1, C: 0, D: 1 });

    const incoming = computeNodeMetric(graph, 'nodeDegree', { direction: 'incoming' });
    expect(incoming).toMatchObject({ A: 1, B: 1, C: 1, D: 1 });

    const both = computeNodeMetric(graph, 'nodeDegree', { direction: 'both' });
    expect(both).toMatchObject({ A: 2, B: 2, C: 1, D: 1 });

    const outgoingServingOnly = computeNodeMetric(graph, 'nodeDegree', {
      direction: 'outgoing',
      relationshipTypes: ['Serving']
    });
    expect(outgoingServingOnly).toMatchObject({ A: 1, B: 0, C: 0, D: 0 });
  });

  test('nodeReach counts distinct reachable nodes within maxDepth', () => {
    const model = buildSmallModel();
    const graph = buildAnalysisGraph(model);

    // Outgoing from A: depth 1 reaches B and D (undirected association), depth 2 also reaches C via B.
    const reach2 = computeNodeMetric(graph, 'nodeReach', { direction: 'outgoing', maxDepth: 2 });
    expect(reach2.A).toBe(3);

    // From D: depth 1 reaches A, depth 2 reaches B via A.
    expect(reach2.D).toBe(2);

    // Incoming to A: only D is reachable due to undirected association.
    const incomingReach2 = computeNodeMetric(graph, 'nodeReach', { direction: 'incoming', maxDepth: 2 });
    expect(incomingReach2.A).toBe(1);

    // Relationship type filter should affect reach.
    const servingOnlyReach2 = computeNodeMetric(graph, 'nodeReach', {
      direction: 'outgoing',
      maxDepth: 3,
      relationshipTypes: ['Serving']
    });
    expect(servingOnlyReach2.A).toBe(1);
    expect(servingOnlyReach2.B).toBe(0);
  });

  test('matrixRelationshipCount respects direction and treats undirected as bidirectional', () => {
    const model = buildSmallModel();

    const forward = computeMatrixMetric(model, 'matrixRelationshipCount', {
      rowIds: ['A', 'B'],
      colIds: ['B', 'C'],
      filters: { direction: 'rowToCol' }
    });

    // A->B and B->C
    expect(forward.values).toEqual([
      [1, 0],
      [0, 1]
    ]);

    const undirected = computeMatrixMetric(model, 'matrixRelationshipCount', {
      rowIds: ['A', 'D'],
      colIds: ['A', 'D'],
      filters: { direction: 'both' }
    });

    // Association A<->D should show in both off-diagonal cells.
    expect(undirected.values).toEqual([
      [0, 1],
      [1, 0]
    ]);
  });
});

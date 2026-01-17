import { createElement, createEmptyModel, createRelationship } from '../../factories';
import type { Model } from '../../types';
import { queryPathsBetween, queryRelatedElements } from '../index';

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

describe('domain analysis engine', () => {
  test('queryRelatedElements returns reachable nodes and supports relationship type filtering', () => {
    const model = buildSmallModel();

    const resAll = queryRelatedElements(model, 'A', { direction: 'outgoing', maxDepth: 3 });
    expect(resAll.hits.map(h => h.elementId)).toEqual(['B', 'D', 'C']);

    const resFiltered = queryRelatedElements(model, 'A', {
      direction: 'outgoing',
      maxDepth: 3,
      relationshipTypes: ['Serving']
    });
    expect(resFiltered.hits.map(h => h.elementId)).toEqual(['B']);
  });

  test('layer filter applies to returned hits, while traversal may pass through excluded nodes', () => {
    const model = buildSmallModel();

    const res = queryRelatedElements(model, 'A', {
      direction: 'outgoing',
      maxDepth: 3,
      archimateLayers: ['Technology']
    });

    // C is Technology, and should be included even though the path passes via B (Application).
    expect(res.hits.map(h => h.elementId)).toEqual(['C']);
    expect(res.hits[0]?.distance).toBe(2);
  });

  test('undirected association is traversable from both ends', () => {
    const model = buildSmallModel();

    const fromD = queryRelatedElements(model, 'D', { direction: 'outgoing', maxDepth: 1 });
    expect(fromD.hits.map(h => h.elementId)).toEqual(['A']);

    const fromA = queryRelatedElements(model, 'A', { direction: 'incoming', maxDepth: 1 });
    // Because association is undirected, incoming traversal at A can reach D.
    expect(fromA.hits.map(h => h.elementId)).toEqual(['D']);
  });

  test('queryPathsBetween returns shortest paths and respects filters', () => {
    const model = buildSmallModel();

    const res = queryPathsBetween(model, 'A', 'C', {
      direction: 'outgoing',
      relationshipTypes: ['Serving', 'Flow']
    });

    expect(res.shortestDistance).toBe(2);
    expect(res.paths.length).toBe(1);
    expect(res.paths[0]?.elementIds).toEqual(['A', 'B', 'C']);
    expect(res.paths[0]?.steps.map(s => s.relationshipId)).toEqual(['R1', 'R2']);
  });
});

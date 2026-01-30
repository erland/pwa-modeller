import { createElement, createEmptyModel, createRelationship } from '../../factories';
import type { Model } from '../../types';
import { findShortestSinglePathWithBans, queryKShortestPathsBetween, queryPathsBetween, queryRelatedElements } from '../index';

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

  // Alternative path A -- D -> C (A -- D is undirected association)
  const r4 = createRelationship({ id: 'R4', type: 'Flow', sourceElementId: d.id, targetElementId: c.id });
  model.relationships[r4.id] = r4;

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
      layers: ['Technology']
    });

    // C is Technology, and should be included even though the path passes via B (Application).
    expect(res.hits.map(h => h.elementId)).toEqual(['C']);
    expect(res.hits[0]?.distance).toBe(2);
  });

  test('element type filter applies to returned hits (can refine within layers)', () => {
    const model = buildSmallModel();

    const res = queryRelatedElements(model, 'A', {
      direction: 'outgoing',
      maxDepth: 1,
      elementTypes: ['BusinessRole']
    });

    // At depth 1 from A we can reach B and D, but only D is a BusinessRole.
    expect(res.hits.map(h => h.elementId)).toEqual(['D']);
  });

  test('undirected association is traversable from both ends', () => {
    const model = buildSmallModel();

    // Only test Association traversal semantics here (D also has an outgoing Flow to C in this fixture).
    const fromD = queryRelatedElements(model, 'D', {
      direction: 'outgoing',
      maxDepth: 1,
      relationshipTypes: ['Association']
    });
    expect(fromD.hits.map(h => h.elementId)).toEqual(['A']);

    const fromA = queryRelatedElements(model, 'A', {
      direction: 'incoming',
      maxDepth: 1,
      relationshipTypes: ['Association']
    });
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

  test('findShortestSinglePathWithBans returns one deterministic shortest path and respects bans', () => {
    const model = buildSmallModel();

    const base = findShortestSinglePathWithBans(model, 'A', 'C', {
      direction: 'outgoing',
      relationshipTypes: ['Serving', 'Flow', 'Association']
    });

    // There are two equal-length paths: A->B->C and A->D->C.
    // Deterministic traversal order should pick A->B->C.
    expect(base?.elementIds).toEqual(['A', 'B', 'C']);
    expect(base?.steps.map(s => s.relationshipId)).toEqual(['R1', 'R2']);

    const bannedEdge = findShortestSinglePathWithBans(
      model,
      'A',
      'C',
      {
        direction: 'outgoing',
        relationshipTypes: ['Serving', 'Flow', 'Association']
      },
      { bannedStepKeys: new Set(['R1:A->B']) }
    );

    // With the A->B step banned, the alternative A->D->C should be chosen.
    expect(bannedEdge?.elementIds).toEqual(['A', 'D', 'C']);
    expect(bannedEdge?.steps.map(s => s.relationshipId)).toEqual(['R3', 'R4']);

    const bannedNode = findShortestSinglePathWithBans(
      model,
      'A',
      'C',
      {
        direction: 'outgoing',
        relationshipTypes: ['Serving', 'Flow', 'Association']
      },
      { bannedNodeIds: new Set(['B']) }
    );
    expect(bannedNode?.elementIds).toEqual(['A', 'D', 'C']);

    const noPath = findShortestSinglePathWithBans(
      model,
      'A',
      'C',
      {
        direction: 'outgoing',
        relationshipTypes: ['Serving', 'Flow', 'Association']
      },
      { bannedNodeIds: new Set(['B', 'D']) }
    );
    expect(noPath).toBeUndefined();
  });

  test('queryKShortestPathsBetween returns multiple shortest paths and longer alternatives (Yen)', () => {
    const model = buildSmallModel();

    // Add a longer alternative: A -> B -> D -> C
    const r5 = createRelationship({ id: 'R5', type: 'Flow', sourceElementId: 'B', targetElementId: 'D' });
    model.relationships[r5.id] = r5;

    const res = queryKShortestPathsBetween(model, 'A', 'C', {
      direction: 'outgoing',
      relationshipTypes: ['Serving', 'Flow', 'Association'],
      maxPaths: 3,
      maxPathLength: 4
    });

    expect(res.shortestDistance).toBe(2);
    expect(res.paths.length).toBe(3);

    // Two equal-length shortest paths.
    expect(res.paths[0]?.elementIds).toEqual(['A', 'B', 'C']);
    expect(res.paths[1]?.elementIds).toEqual(['A', 'D', 'C']);

    // Next best is the longer alternative.
    expect(res.paths[2]?.elementIds).toEqual(['A', 'B', 'D', 'C']);
    expect(res.paths[2]?.steps.map(s => s.relationshipId)).toEqual(['R1', 'R5', 'R4']);
  });
});

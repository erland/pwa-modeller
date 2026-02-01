import { createElement, createEmptyModel, createRelationship } from '../../../../../domain/factories';
import type { Model } from '../../../../../domain/types';

import { computeIntermediatesPreview, computeRelatedPreview } from '../computePreview';

function buildUniqueChainModel(): Model {
  const model = createEmptyModel({ name: 'Chain' });

  const a = createElement({ id: 'A', name: 'A', type: 'uml.class', layer: 'Application' });
  const b = createElement({ id: 'B', name: 'B', type: 'uml.class', layer: 'Application' });
  const c = createElement({ id: 'C', name: 'C', type: 'uml.class', layer: 'Application' });

  model.elements[a.id] = a;
  model.elements[b.id] = b;
  model.elements[c.id] = c;

  const ab = createRelationship({
    id: 'R_AB',
    kind: 'uml',
    sourceElementId: 'A',
    targetElementId: 'B',
    type: 'uml.association',
  });
  const bc = createRelationship({
    id: 'R_BC',
    kind: 'uml',
    sourceElementId: 'B',
    targetElementId: 'C',
    type: 'uml.association',
  });

  model.relationships[ab.id] = ab;
  model.relationships[bc.id] = bc;

  return model;
}

function buildBranchModel(): Model {
  const model = createEmptyModel({ name: 'Branch' });

  const a = createElement({ id: 'A', name: 'A', type: 'uml.class', layer: 'Application' });
  const b = createElement({ id: 'B', name: 'B', type: 'uml.class', layer: 'Application' });
  const c = createElement({ id: 'C', name: 'C', type: 'uml.class', layer: 'Application' });
  const d = createElement({ id: 'D', name: 'D', type: 'uml.class', layer: 'Application' });

  model.elements[a.id] = a;
  model.elements[b.id] = b;
  model.elements[c.id] = c;
  model.elements[d.id] = d;

  const ab = createRelationship({
    id: 'R_AB',
    kind: 'uml',
    sourceElementId: 'A',
    targetElementId: 'B',
    type: 'uml.association',
  });
  const bc = createRelationship({
    id: 'R_BC',
    kind: 'uml',
    sourceElementId: 'B',
    targetElementId: 'C',
    type: 'uml.association',
  });
  const ad = createRelationship({
    id: 'R_AD',
    kind: 'uml',
    sourceElementId: 'A',
    targetElementId: 'D',
    type: 'uml.association',
  });
  const dc = createRelationship({
    id: 'R_DC',
    kind: 'uml',
    sourceElementId: 'D',
    targetElementId: 'C',
    type: 'uml.association',
  });

  model.relationships[ab.id] = ab;
  model.relationships[bc.id] = bc;
  model.relationships[ad.id] = ad;
  model.relationships[dc.id] = dc;

  return model;
}

function commonArgs(model: Model) {
  return {
    model,
    enabledRelationshipTypes: ['uml.association'],
    existingSet: new Set<string>(),
    enabledElementTypesSet: new Set<string>(['uml.class']),
    includeAlreadyInSandbox: true,
  };
}

describe('computePreview', () => {
  test('intermediates preview returns intermediate candidates and defaults select them', () => {
    const model = buildUniqueChainModel();

    const res = computeIntermediatesPreview({
      ...commonArgs(model),
      sourceElementId: 'A',
      targetElementId: 'C',
      mode: 'topk',
      k: 1,
      maxHops: 3,
      direction: 'outgoing',
    });

    expect(res.paths).toHaveLength(1);
    expect(res.paths[0].path).toEqual(['A', 'B', 'C']);
    expect(res.paths[0].intermediates).toEqual(['B']);

    expect(res.candidates.map((x) => x.id)).toEqual(['B']);
    expect(Array.from(res.defaultSelectedIds)).toEqual(['B']);
  });

  test('intermediates preview excludes already-in-sandbox when requested', () => {
    const model = buildUniqueChainModel();
    const existing = new Set<string>(['B']);

    const res = computeIntermediatesPreview({
      ...commonArgs(model),
      existingSet: existing,
      includeAlreadyInSandbox: false,
      sourceElementId: 'A',
      targetElementId: 'C',
      mode: 'topk',
      k: 1,
      maxHops: 3,
      direction: 'outgoing',
    });

    expect(res.paths).toHaveLength(1);
    expect(res.candidates).toHaveLength(0);
    expect(Array.from(res.defaultSelectedIds)).toEqual([]);
  });

  test('intermediates preview clamps hops and can yield zero results if too small', () => {
    const model = buildUniqueChainModel();

    const res = computeIntermediatesPreview({
      ...commonArgs(model),
      sourceElementId: 'A',
      targetElementId: 'C',
      mode: 'topk',
      k: 1,
      maxHops: 0,
      direction: 'outgoing',
    });

    expect(res.paths).toHaveLength(0);
    expect(res.candidates).toHaveLength(0);
  });

  test('related preview returns candidates within depth and direction, sorted by type/name', () => {
    const model = buildBranchModel();

    const res = computeRelatedPreview({
      ...commonArgs(model),
      anchorElementIds: ['A'],
      depth: 2,
      direction: 'outgoing',
    });

    const ids = res.candidates.map((c) => c.id);
    expect(ids).toEqual(['B', 'C', 'D']);
    expect(Array.from(res.defaultSelectedIds)).toEqual(ids);
  });

  test('related preview excludes anchors and de-duplicates candidates', () => {
    const model = buildBranchModel();

    const res = computeRelatedPreview({
      ...commonArgs(model),
      anchorElementIds: ['A', 'A', 'NOPE'],
      depth: 1,
      direction: 'outgoing',
    });
    expect(res.candidates.map((c) => c.id)).toEqual(['B', 'D']);
  });
});

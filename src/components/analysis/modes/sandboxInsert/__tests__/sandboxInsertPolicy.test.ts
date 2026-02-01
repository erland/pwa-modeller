import { createElement, createEmptyModel } from '../../../../../domain/factories';
import type { Model } from '../../../../../domain/types';

import {
  computeAllElementTypesForModel,
  computeInitialEnabledRelationshipTypes,
  computeRelationshipTypesForDialog,
  keepEnabledRelationshipTypesValid,
  normalizeIntermediatesOptions,
  normalizeRelatedOptions,
} from '../sandboxInsertPolicy';

function buildUmlModel(): Model {
  const model = createEmptyModel({ name: 'UML' });
  const a = createElement({ id: 'A', name: 'A', type: 'uml.class', layer: 'Application' });
  const b = createElement({ id: 'B', name: 'B', type: 'uml.class', layer: 'Application' });
  model.elements[a.id] = a;
  model.elements[b.id] = b;
  return model;
}

describe('sandboxInsertPolicy', () => {
  test('computeAllElementTypesForModel returns unique sorted list', () => {
    const model = buildUmlModel();
    const types = computeAllElementTypesForModel(model);
    expect(types).toEqual(['uml.class']);
  });

  test('computeRelationshipTypesForDialog filters by kind inferred from elements', () => {
    const model = buildUmlModel();
    const all = ['Association', 'uml.association'];

    expect(
      computeRelationshipTypesForDialog({
        model,
        kind: 'intermediates',
        allRelationshipTypes: all,
        sourceElementId: 'A',
        targetElementId: 'B',
      })
    ).toEqual(['uml.association']);

    expect(
      computeRelationshipTypesForDialog({
        model,
        kind: 'related',
        allRelationshipTypes: all,
        anchorElementIds: ['A'],
      })
    ).toEqual(['uml.association']);
  });

  test('computeInitialEnabledRelationshipTypes filters invalid and defaults to dialog list when needed', () => {
    expect(
      computeInitialEnabledRelationshipTypes({
        relationshipTypesForDialog: ['Serving', 'Flow'],
        initialEnabledRelationshipTypes: ['Flow', 'NOPE'],
      })
    ).toEqual(['Flow']);

    expect(
      computeInitialEnabledRelationshipTypes({
        relationshipTypesForDialog: ['Serving', 'Flow'],
        initialEnabledRelationshipTypes: [],
      })
    ).toEqual(['Serving', 'Flow']);
  });

  test('keepEnabledRelationshipTypesValid restores defaults only when dialog is open and list is empty', () => {
    // Dialog closed: keep as-is, even if empty.
    expect(
      keepEnabledRelationshipTypesValid({
        isOpen: false,
        relationshipTypesForDialog: ['Serving'],
        enabledTypes: [],
      })
    ).toEqual([]);

    // Dialog open: keep valid subset.
    expect(
      keepEnabledRelationshipTypesValid({
        isOpen: true,
        relationshipTypesForDialog: ['Serving', 'Flow'],
        enabledTypes: ['Serving'],
      })
    ).toEqual(['Serving']);

    // Dialog open: if none valid, restore to full set.
    expect(
      keepEnabledRelationshipTypesValid({
        isOpen: true,
        relationshipTypesForDialog: ['Serving'],
        enabledTypes: ['NOPE'],
      })
    ).toEqual(['Serving']);
  });

  test('normalizeIntermediatesOptions clamps to safe ranges', () => {
    expect(
      normalizeIntermediatesOptions({
        mode: 'topk',
        k: 0,
        maxHops: 0,
        direction: 'both',
      })
    ).toEqual({
      mode: 'topk',
      k: 1,
      maxHops: 1,
      direction: 'both',
    });

    expect(
      normalizeIntermediatesOptions({
        mode: 'shortest',
        k: 999,
        maxHops: 999,
        direction: 'incoming',
      })
    ).toEqual({
      mode: 'shortest',
      k: 10,
      maxHops: 16,
      direction: 'incoming',
    });
  });

  test('normalizeRelatedOptions clamps to safe ranges', () => {
    expect(
      normalizeRelatedOptions({
        depth: 0,
        direction: 'outgoing',
      })
    ).toEqual({
      depth: 1,
      direction: 'outgoing',
    });

    expect(
      normalizeRelatedOptions({
        depth: 999,
        direction: 'both',
      })
    ).toEqual({
      depth: 6,
      direction: 'both',
    });
  });
});

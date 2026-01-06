import type { Model } from '../types';
import {
  buildModelExternalIdIndex,
  resolveElementIdByExternalId,
  resolveRelationshipIdByExternalId,
  resolveViewIdByExternalId
} from '../externalIdIndex';

function makeEmptyModel(): Model {
  return {
    id: 'm1',
    metadata: { name: 'Test' },
    elements: {},
    relationships: {},
    views: {},
    folders: {}
  };
}

describe('domain externalIdIndex', () => {
  test('buildModelExternalIdIndex indexes entities and reports duplicates', () => {
    const model = makeEmptyModel();
    model.elements.e1 = {
      id: 'e1',
      type: 'BusinessActor' as any,
      name: 'E1',
      layer: 'Business',
      externalIds: [{ system: 'archimate-exchange', id: 'id-1' }]
    } as any;
    model.elements.e2 = {
      id: 'e2',
      type: 'BusinessActor' as any,
      name: 'E2',
      layer: 'Business',
      // duplicate external id key
      externalIds: [{ system: 'archimate-exchange', id: 'id-1' }]
    } as any;

    model.relationships.r1 = {
      id: 'r1',
      type: 'Association' as any,
      source: 'e1',
      target: 'e2',
      externalIds: [{ system: 'archimate-exchange', id: 'rel-1', scope: 'modelA' }]
    } as any;

    model.views.v1 = {
      id: 'v1',
      name: 'View1',
      nodes: [],
      connections: [],
      externalIds: [{ system: 'archimate-exchange', id: 'view-1' }]
    } as any;

    const idx = buildModelExternalIdIndex(model);

    expect(resolveElementIdByExternalId(idx, 'archimate-exchange', 'id-1')).toBe('e1');
    expect(resolveRelationshipIdByExternalId(idx, 'archimate-exchange', 'rel-1', 'modelA')).toBe(
      'r1'
    );
    expect(resolveViewIdByExternalId(idx, 'archimate-exchange', 'view-1')).toBe('v1');

    expect(idx.duplicates).toEqual([
      {
        kind: 'element',
        key: 'archimate-exchange||id-1',
        keptInternalId: 'e1',
        droppedInternalId: 'e2'
      }
    ]);
  });
});

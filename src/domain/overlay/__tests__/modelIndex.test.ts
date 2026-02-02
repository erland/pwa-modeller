import type { Model } from '../../types';
import { buildOverlayModelExternalIdIndex, getUniqueExternalRefsForTarget, resolveTargetsByExternalKey } from '../modelIndex';

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

describe('domain overlay modelIndex', () => {
  test('indexes elements and relationships as 1:N targets per externalKey', () => {
    const model = makeEmptyModel();

    model.elements.e1 = {
      id: 'e1',
      type: 'BusinessActor' as any,
      name: 'E1',
      layer: 'Business',
      externalIds: [
        { system: 'archimate-exchange', id: 'id-1' },
        { system: 'ea-xmi', id: 'EAID_1', scope: 'pkgA' }
      ]
    } as any;

    // Shares one external key with e1 to force ambiguity.
    model.elements.e2 = {
      id: 'e2',
      type: 'BusinessActor' as any,
      name: 'E2',
      layer: 'Business',
      externalIds: [{ system: 'archimate-exchange', id: 'id-1' }]
    } as any;

    model.relationships.r1 = {
      id: 'r1',
      type: 'Association' as any,
      sourceElementId: 'e1',
      targetElementId: 'e2',
      externalIds: [{ system: 'archimate-exchange', id: 'rel-1' }]
    } as any;

    const idx = buildOverlayModelExternalIdIndex(model);

    expect(resolveTargetsByExternalKey(idx, 'archimate-exchange||id-1')).toEqual([
      { kind: 'element', id: 'e1' },
      { kind: 'element', id: 'e2' }
    ]);

    expect(resolveTargetsByExternalKey(idx, 'ea-xmi|pkgA|EAID_1')).toEqual([
      { kind: 'element', id: 'e1' }
    ]);

    expect(resolveTargetsByExternalKey(idx, 'archimate-exchange||rel-1')).toEqual([
      { kind: 'relationship', id: 'r1' }
    ]);
  });

  test('dedupes per target to avoid duplicate entries when an entity repeats the same key', () => {
    const model = makeEmptyModel();
    model.elements.e1 = {
      id: 'e1',
      type: 'BusinessActor' as any,
      name: 'E1',
      layer: 'Business',
      externalIds: [
        { system: 'archimate-exchange', id: 'id-1' },
        { system: 'archimate-exchange', id: 'id-1' }
      ]
    } as any;

    const idx = buildOverlayModelExternalIdIndex(model);
    expect(resolveTargetsByExternalKey(idx, 'archimate-exchange||id-1')).toEqual([
      { kind: 'element', id: 'e1' }
    ]);
  });

  test('getUniqueExternalRefsForTarget returns refs whose keys map uniquely to that target', () => {
    const model = makeEmptyModel();

    model.elements.e1 = {
      id: 'e1',
      type: 'BusinessActor' as any,
      name: 'E1',
      layer: 'Business',
      externalIds: [
        { system: 'archimate-exchange', id: 'shared' },
        { system: 'ea-xmi', id: 'EAID_1', scope: 'pkgA' }
      ]
    } as any;

    model.elements.e2 = {
      id: 'e2',
      type: 'BusinessActor' as any,
      name: 'E2',
      layer: 'Business',
      externalIds: [{ system: 'archimate-exchange', id: 'shared' }]
    } as any;

    const idx = buildOverlayModelExternalIdIndex(model);

    const unique = getUniqueExternalRefsForTarget(model, idx, { kind: 'element', id: 'e1' });
    // EAID_1 is unique to e1, while 'shared' is not.
    expect(unique).toEqual([{ system: 'ea-xmi', id: 'EAID_1', scope: 'pkgA' }]);
  });
});

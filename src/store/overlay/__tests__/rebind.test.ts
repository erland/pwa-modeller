import type { Model } from '../../../domain';
import { OverlayStore } from '../OverlayStore';
import { rebindOverlayEntryToTarget } from '../rebind';

function makeEmptyModel(): Model {
  return {
    id: 'm1',
    metadata: { name: 'Test' },
    elements: {},
    relationships: {},
    views: {},
    folders: {}
  } as any;
}

describe('overlay rebind', () => {
  test('rebind replaces refs using unique refs when available', () => {
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

    const store = new OverlayStore();
    const entryId = store.upsertEntry({
      kind: 'element',
      externalRefs: [{ scheme: 'archimate-exchange', value: 'shared' }],
      tags: { owner: 'x' }
    });

    const res = rebindOverlayEntryToTarget(store, model, entryId, { kind: 'element', id: 'e1' }, { preferUniqueRefs: true });
    expect(res.ok).toBe(true);

    const entry = store.getEntry(entryId)!;
    // Unique key should be used (EAID_1), not the shared key.
    expect(entry.target.externalRefs).toEqual([{ scheme: 'ea-xmi@pkgA', value: 'EAID_1' }]);
    expect(entry.tags.owner).toBe('x');
  });
});

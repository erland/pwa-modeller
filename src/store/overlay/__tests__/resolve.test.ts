import type { Model } from '../../../domain/types';
import { buildOverlayModelExternalIdIndex } from '../../../domain/overlay';
import { OverlayStore } from '../OverlayStore';
import { resolveOverlayAgainstModel } from '../resolve';

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

describe('overlay resolve', () => {
  test('attaches via any matching ref in the ref-set', () => {
    const model = makeEmptyModel();
    model.elements.e1 = {
      id: 'e1',
      type: 'BusinessActor' as any,
      name: 'E1',
      layer: 'Business',
      externalIds: [{ system: 'archimate-exchange', id: 'id-1' }]
    } as any;

    const idx = buildOverlayModelExternalIdIndex(model);
    const store = new OverlayStore();
    const entryId = store.upsertEntry({
      kind: 'element',
      externalRefs: [
        { scheme: 'archimate-exchange', value: 'nope' },
        { scheme: 'archimate-exchange', value: 'id-1' }
      ],
      tags: { owner: 'overlay' }
    });

    const rep = resolveOverlayAgainstModel(store.listEntries(), idx);
    expect(rep.counts).toEqual({ attached: 1, orphan: 0, ambiguous: 0 });
    expect(rep.attached[0].entryId).toBe(entryId);
    expect(rep.attached[0].target).toEqual({ kind: 'element', id: 'e1' });
  });

  test('orphan when no refs match any model targets (or kind mismatches)', () => {
    const model = makeEmptyModel();
    model.elements.e1 = {
      id: 'e1',
      type: 'BusinessActor' as any,
      name: 'E1',
      layer: 'Business',
      externalIds: [{ system: 'archimate-exchange', id: 'id-1' }]
    } as any;

    const idx = buildOverlayModelExternalIdIndex(model);
    const store = new OverlayStore();

    const orphanId = store.upsertEntry({
      kind: 'element',
      externalRefs: [{ scheme: 'archimate-exchange', value: 'missing' }],
      tags: { a: 1 }
    });

    // Kind mismatch: relationship overlay cannot attach to element targets.
    const kindMismatchId = store.upsertEntry({
      kind: 'relationship',
      externalRefs: [{ scheme: 'archimate-exchange', value: 'id-1' }],
      tags: { b: true }
    });

    const rep = resolveOverlayAgainstModel(store.listEntries(), idx);
    expect(rep.counts).toEqual({ attached: 0, orphan: 2, ambiguous: 0 });
    const ids = rep.orphan.map((o) => o.entryId).sort();
    expect(ids).toEqual([kindMismatchId, orphanId].sort());
  });

  test('ambiguous when a ref matches multiple targets of the same kind', () => {
    const model = makeEmptyModel();
    model.elements.e1 = {
      id: 'e1',
      type: 'BusinessActor' as any,
      name: 'E1',
      layer: 'Business',
      externalIds: [{ system: 'archimate-exchange', id: 'id-shared' }]
    } as any;
    model.elements.e2 = {
      id: 'e2',
      type: 'BusinessActor' as any,
      name: 'E2',
      layer: 'Business',
      externalIds: [{ system: 'archimate-exchange', id: 'id-shared' }]
    } as any;

    const idx = buildOverlayModelExternalIdIndex(model);
    const store = new OverlayStore();
    const entryId = store.upsertEntry({
      kind: 'element',
      externalRefs: [{ scheme: 'archimate-exchange', value: 'id-shared' }],
      tags: { x: 'y' }
    });

    const rep = resolveOverlayAgainstModel(store.listEntries(), idx);
    expect(rep.counts).toEqual({ attached: 0, orphan: 0, ambiguous: 1 });
    expect(rep.ambiguous[0].entryId).toBe(entryId);
    expect(rep.ambiguous[0].candidates).toEqual([
      { kind: 'element', id: 'e1' },
      { kind: 'element', id: 'e2' }
    ]);
  });

  test('store maintains a refIndex mapping externalKey -> entryIds', () => {
    const store = new OverlayStore();
    const entryId = store.upsertEntry({
      kind: 'element',
      externalRefs: [{ scheme: 'archimate-exchange', value: 'id-1' }],
      tags: { k: 'v' }
    });

    const ids = store.findEntryIdsByExternalKey('archimate-exchange||id-1');
    expect(ids).toEqual([entryId]);

    store.deleteEntry(entryId);
    expect(store.findEntryIdsByExternalKey('archimate-exchange||id-1')).toEqual([]);
  });
});

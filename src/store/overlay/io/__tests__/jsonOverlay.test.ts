import type { Model } from '../../../../domain/types';
import { buildOverlayModelExternalIdIndex, computeModelSignature, OVERLAY_FILE_FORMAT_V1 } from '../../../../domain/overlay';
import { OverlayStore } from '../../OverlayStore';
import { importOverlayFileToStore, parseOverlayJson, serializeOverlayStoreToJson } from '../jsonOverlay';

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

describe('json overlay io', () => {
  test('round-trips store -> json -> file', () => {
    const model = makeEmptyModel();
    model.elements.e1 = {
      id: 'e1',
      type: 'BusinessActor' as any,
      name: 'E1',
      layer: 'Business',
      externalIds: [{ system: 'archimate-exchange', id: 'id-1' }]
    } as any;

    const store = new OverlayStore();
    store.upsertEntry({
      kind: 'element',
      externalRefs: [{ scheme: 'archimate-exchange', value: 'id-1' }],
      tags: { owner: 'alice', score: 3 }
    });

    const json = serializeOverlayStoreToJson({ overlayStore: store, model });
    const file = parseOverlayJson(json);
    expect(file.format).toBe(OVERLAY_FILE_FORMAT_V1);
    expect(file.entries).toHaveLength(1);
    expect(file.entries[0].target.kind).toBe('element');
    expect(file.entries[0].target.externalRefs).toEqual([{ scheme: 'archimate-exchange', value: 'id-1' }]);
    expect(file.entries[0].tags).toEqual({ owner: 'alice', score: 3 });
  });

  test('merge: overlapping refs (same kind) updates tags and unions refs', () => {
    const model = makeEmptyModel();
    model.elements.e1 = {
      id: 'e1',
      type: 'BusinessActor' as any,
      name: 'E1',
      layer: 'Business',
      externalIds: [{ system: 'archimate-exchange', id: 'id-1' }]
    } as any;

    const store = new OverlayStore();
    const existingId = store.upsertEntry({
      kind: 'element',
      externalRefs: [{ scheme: 'archimate-exchange', value: 'id-1' }],
      tags: { a: 1, keep: true }
    });

    const imported = {
      format: OVERLAY_FILE_FORMAT_V1,
      createdAt: new Date().toISOString(),
      modelHint: { signature: computeModelSignature(model) },
      entries: [
        {
          target: {
            kind: 'element',
            externalRefs: [
              { scheme: 'archimate-exchange', value: 'id-1' },
              { scheme: 'archimate-exchange', value: 'id-2' }
            ]
          },
          tags: { a: 9, b: 2 }
        }
      ]
    };

    const idx = buildOverlayModelExternalIdIndex(model);
    const res = importOverlayFileToStore({
      overlayStore: store,
      overlayFile: imported as any,
      model,
      modelIndex: idx,
      options: { strategy: 'merge' }
    });

    expect(res.stats.updated).toBe(1);
    const updated = store.getEntry(existingId)!;
    expect(updated.tags).toEqual({ a: 9, keep: true, b: 2 });
    expect(updated.target.externalRefs).toEqual([
      { scheme: 'archimate-exchange', value: 'id-1' },
      { scheme: 'archimate-exchange', value: 'id-2' }
    ]);
  });

  test('signature mismatch produces warning by default', () => {
    const modelA = makeEmptyModel();
    modelA.elements.e1 = {
      id: 'e1',
      type: 'BusinessActor' as any,
      name: 'E1',
      layer: 'Business',
      externalIds: [{ system: 'archimate-exchange', id: 'id-a' }]
    } as any;

    const modelB = makeEmptyModel();
    modelB.elements.e1 = {
      id: 'e1',
      type: 'BusinessActor' as any,
      name: 'E1',
      layer: 'Business',
      externalIds: [{ system: 'archimate-exchange', id: 'id-b' }]
    } as any;

    const store = new OverlayStore();
    store.upsertEntry({
      kind: 'element',
      externalRefs: [{ scheme: 'archimate-exchange', value: 'id-a' }],
      tags: { x: 'y' }
    });
    const json = serializeOverlayStoreToJson({ overlayStore: store, model: modelA });
    const file = parseOverlayJson(json);

    const res = importOverlayFileToStore({
      overlayStore: new OverlayStore(),
      overlayFile: file,
      model: modelB,
      modelIndex: buildOverlayModelExternalIdIndex(modelB)
    });

    expect(res.warnings.some((w) => w.type === 'signature-mismatch')).toBe(true);
  });

  test('merge conflict: multiple existing matches creates new entry and warning', () => {
    const model = makeEmptyModel();
    const store = new OverlayStore();

    store.upsertEntry({
      kind: 'element',
      externalRefs: [{ scheme: 'archimate-exchange', value: 'shared' }],
      tags: { a: 1 }
    });
    store.upsertEntry({
      kind: 'element',
      externalRefs: [{ scheme: 'archimate-exchange', value: 'shared' }],
      tags: { b: 2 }
    });

    const imported = {
      format: OVERLAY_FILE_FORMAT_V1,
      createdAt: new Date().toISOString(),
      entries: [
        {
          target: { kind: 'element', externalRefs: [{ scheme: 'archimate-exchange', value: 'shared' }] },
          tags: { c: 3 }
        }
      ]
    };

    const res = importOverlayFileToStore({
      overlayStore: store,
      overlayFile: imported as any,
      model,
      modelIndex: buildOverlayModelExternalIdIndex(model)
    });

    expect(res.warnings.some((w) => w.type === 'merge-conflict-multiple-existing')).toBe(true);
    expect(res.stats.conflictsCreatedNew).toBe(1);
    expect(store.listEntries()).toHaveLength(3);
  });
});

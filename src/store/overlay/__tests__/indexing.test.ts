import { buildOverlayAttachmentIndex, getOverlayTagsForElementId, getOverlayTagsForRelationshipId } from '../indexing';
import { OverlayStore } from '../OverlayStore';
import type { Model } from '../../../domain/types';

function m(): Model {
  return {
    name: 'M',
    elements: {
      e1: { id: 'e1', type: 'ApplicationComponent', name: 'A', externalIds: [{ system: 'archimate-meff', id: 'E1' }] },
      e2: { id: 'e2', type: 'ApplicationComponent', name: 'B', externalIds: [{ system: 'archimate-meff', id: 'E2' }] }
    },
    relationships: {
      r1: {
        id: 'r1',
        type: 'Flow',
        sourceElementId: 'e1',
        targetElementId: 'e2',
        externalIds: [{ system: 'archimate-meff', id: 'R1' }]
      }
    },
    folders: {},
    views: {},
    // minimal required fields; other optional props omitted
  } as unknown as Model;
}

describe('overlay indexing', () => {
  test('buildOverlayAttachmentIndex attaches entries and merges tags deterministically', () => {
    const model = m();
    const store = new OverlayStore();

    // Two entries attach to the same element; later entryId wins for conflicting keys.
    store.upsertEntry({
      entryId: 'ovl_a',
      kind: 'element',
      externalRefs: [{ scheme: 'archimate-meff', value: 'E1' }],
      tags: { foo: '1', a: 'x' }
    });
    store.upsertEntry({
      entryId: 'ovl_b',
      kind: 'element',
      externalRefs: [{ scheme: 'archimate-meff', value: 'E1' }],
      tags: { foo: '2' }
    });
    store.upsertEntry({
      entryId: 'ovl_r',
      kind: 'relationship',
      externalRefs: [{ scheme: 'archimate-meff', value: 'R1' }],
      tags: { rel: true }
    });

    const idx = buildOverlayAttachmentIndex(model, store);
    expect(idx.orphanEntryIds).toEqual([]);

    const elTags = getOverlayTagsForElementId(idx, 'e1');
    expect(elTags).toEqual({ foo: '2', a: 'x' });

    const relTags = getOverlayTagsForRelationshipId(idx, 'r1');
    expect(relTags).toEqual({ rel: true });
  });

  test('orphan entries are tracked', () => {
    const model = m();
    const store = new OverlayStore();
    store.upsertEntry({
      entryId: 'ovl_orphan',
      kind: 'element',
      externalRefs: [{ scheme: 'archimate-meff', value: 'NOPE' }],
      tags: { x: 1 }
    });
    const idx = buildOverlayAttachmentIndex(model, store);
    expect(idx.orphanEntryIds).toEqual(['ovl_orphan']);
  });
});

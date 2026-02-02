import type { Element, Model, Relationship } from '../../../domain';

import { overlayStore } from '../overlayStoreInstance';
import { getEffectiveTagsForElement, getEffectiveTagsForRelationship } from '../effectiveTags';

function minimalModel(): Model {
  return {
    schemaVersion: 1,
    kind: 'archimate',
    name: 'm',
    elements: {},
    relationships: {},
    connectors: {},
    folders: {},
    views: {}
  } as unknown as Model;
}

describe('overlay effective tags accessor', () => {
  beforeEach(() => {
    overlayStore.clear();
  });

  test('element: overlay overrides core tagged values by key', () => {
    const model = minimalModel();

    const el: Element = {
      id: 'e1',
      name: 'E',
      type: 'BusinessActor',
      externalIds: [{ system: 'xmi', id: 'EAID_1' }],
      taggedValues: [{ id: 'tv1', ns: 'xmi', key: 'owner', value: 'core' }]
    };
    model.elements = { e1: el } as any;

    overlayStore.upsertEntry({
      entryId: 'ovl1',
      kind: 'element',
      externalRefs: [{ scheme: 'xmi', value: 'EAID_1' }],
      tags: { owner: 'overlay' }
    });

    const res = getEffectiveTagsForElement(model, el, overlayStore);
    expect(res.overlayMatch.kind).toBe('single');
    expect(res.overriddenCoreKeys).toEqual(['owner']);
    // Effective should contain overlay owner and not the core owner.
    expect(res.effectiveTaggedValues.some((t) => t.key === 'owner' && (t.ns ?? '') !== 'overlay')).toBe(false);
    expect(res.effectiveTaggedValues.some((t) => t.key === 'owner' && t.ns === 'overlay' && t.value === 'overlay')).toBe(true);
  });

  test('relationship: multiple matching overlay entries merge deterministically (later entryId wins)', () => {
    const model = minimalModel();

    const rel: Relationship = {
      id: 'r1',
      type: 'Association',
      sourceElementId: 'e1',
      targetElementId: 'e2',
      externalIds: [{ system: 'archimate-meff', id: 'EAID_R' }],
      taggedValues: [{ id: 'tv1', ns: 'archimate-meff', key: 'k', value: 'core' }]
    };
    model.relationships = { r1: rel } as any;

    // Two entries match the same ref; by entryId ordering, 'b' wins.
    overlayStore.upsertEntry({
      entryId: 'a',
      kind: 'relationship',
      externalRefs: [{ scheme: 'archimate-meff', value: 'EAID_R' }],
      tags: { k: 'A', x: 1 }
    });
    overlayStore.upsertEntry({
      entryId: 'b',
      kind: 'relationship',
      externalRefs: [{ scheme: 'archimate-meff', value: 'EAID_R' }],
      tags: { k: 'B' }
    });

    const res = getEffectiveTagsForRelationship(model, rel, overlayStore);
    expect(res.overlayMatch.kind).toBe('multiple');
    expect(res.overlayTags.k).toBe('B');
    expect(res.overlayTags.x).toBe(1);
    expect(res.overriddenCoreKeys).toEqual(['k']);
  });
});

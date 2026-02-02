import type { TaggedValue } from '../../types';

import { mergeTaggedValuesWithOverlay, overlayTagsToTaggedValues, OVERLAY_TAG_NS } from '../effectiveTags';

describe('overlay effectiveTags', () => {
  test('overlayTagsToTaggedValues infers types and uses overlay namespace', () => {
    const list = overlayTagsToTaggedValues({
      str: 'x',
      num: 12,
      bool: true,
      nul: null,
      obj: { a: 1 },
      arr: [1, 2]
    });

    const byKey = new Map(list.map((t) => [t.key, t]));

    expect(byKey.get('str')!.ns).toBe(OVERLAY_TAG_NS);
    expect(byKey.get('str')!.type).toBe('string');
    expect(byKey.get('str')!.value).toBe('x');

    expect(byKey.get('num')!.type).toBe('number');
    expect(byKey.get('num')!.value).toBe('12');

    expect(byKey.get('bool')!.type).toBe('boolean');
    expect(byKey.get('bool')!.value).toBe('true');

    expect(byKey.get('nul')!.type).toBe('json');
    expect(byKey.get('nul')!.value).toBe('null');

    expect(byKey.get('obj')!.type).toBe('json');
    expect(byKey.get('obj')!.value).toBe('{"a":1}');

    expect(byKey.get('arr')!.type).toBe('json');
    expect(byKey.get('arr')!.value).toBe('[1,2]');
  });

  test('mergeTaggedValuesWithOverlay: overlay overrides core by key (ignores namespaces)', () => {
    const core: TaggedValue[] = [
      { id: '1', ns: 'importA', key: 'cost', type: 'number', value: '10' },
      { id: '2', ns: 'importB', key: 'owner', value: 'coreOwner' },
      { id: '3', ns: 'importA', key: 'owner', value: 'coreOwner2' },
      { id: '4', ns: 'importA', key: 'keep', value: 'x' }
    ];

    const { effective, overriddenCoreKeys } = mergeTaggedValuesWithOverlay(core, {
      owner: 'overlayOwner',
      extra: 123
    });

    // All core rows with key=owner should be removed from the effective list.
    expect(effective.some((t) => t.key === 'owner' && (t.ns ?? '') !== OVERLAY_TAG_NS)).toBe(false);

    // Non-overridden core rows remain.
    expect(effective.some((t) => t.key === 'cost')).toBe(true);
    expect(effective.some((t) => t.key === 'keep')).toBe(true);

    // Overlay rows added.
    const ownerRow = effective.find((t) => t.key === 'owner' && t.ns === OVERLAY_TAG_NS);
    expect(ownerRow).toBeTruthy();
    expect(ownerRow!.value).toBe('overlayOwner');

    const extraRow = effective.find((t) => t.key === 'extra' && t.ns === OVERLAY_TAG_NS);
    expect(extraRow).toBeTruthy();
    expect(extraRow!.type).toBe('number');
    expect(extraRow!.value).toBe('123');

    expect(overriddenCoreKeys).toEqual(['owner']);
  });
});

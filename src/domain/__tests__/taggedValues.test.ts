import { normalizeKey, normalizeNs, removeTaggedValue, upsertTaggedValue, validateTaggedValue } from '../taggedValues';

describe('domain taggedValues helpers', () => {
  test('normalizeNs trims and defaults to empty', () => {
    expect(normalizeNs(undefined)).toBe('');
    expect(normalizeNs('  ea  ')).toBe('ea');
  });

  test('normalizeKey trims', () => {
    expect(normalizeKey('  key  ')).toBe('key');
  });

  test('upsertTaggedValue overwrites by (ns,key) and preserves existing id', () => {
    const list = [
      { id: 'tag_1', ns: undefined, key: ' foo ', type: 'string' as const, value: '1' }
    ];

    const next = upsertTaggedValue(list, {
      id: 'tag_2',
      ns: '   ',
      key: 'foo',
      type: 'string',
      value: '2'
    });

    expect(next).toHaveLength(1);
    expect(next[0].id).toBe('tag_1');
    expect(next[0].ns).toBeUndefined();
    expect(next[0].key).toBe('foo');
    expect(next[0].value).toBe('2');
  });

  test('upsertTaggedValue trims ns/key and inserts when not present', () => {
    const next = upsertTaggedValue(undefined, {
      id: 'tag_1',
      ns: '  ea  ',
      key: '  stereotype  ',
      type: 'string',
      value: 'ApplicationComponent'
    });

    expect(next).toHaveLength(1);
    expect(next[0].ns).toBe('ea');
    expect(next[0].key).toBe('stereotype');
  });

  test('upsertTaggedValue drops/ignores empty key', () => {
    const list = [{ id: 'tag_1', ns: 'x', key: 'k', value: 'v' }];
    const next = upsertTaggedValue(list, { id: 'tag_2', ns: 'x', key: '   ', value: 'nope' });
    expect(next).toEqual(list);

    const next2 = upsertTaggedValue(undefined, { id: 'tag_1', key: '   ', value: 'x' } as any);
    expect(next2).toEqual([]);
  });

  test('removeTaggedValue removes by id', () => {
    const list = [
      { id: 'tag_1', key: 'a', value: '1' },
      { id: 'tag_2', key: 'b', value: '2' }
    ];
    expect(removeTaggedValue(list, 'tag_1')).toEqual([{ id: 'tag_2', key: 'b', value: '2' }]);
  });

  test('validateTaggedValue validates by declared type and can canonicalize values', () => {
    const okBool = validateTaggedValue({ id: 't', key: 'flag', type: 'boolean', value: ' TRUE ' });
    expect(okBool.errors).toEqual([]);
    expect(okBool.normalized.value).toBe('true');

    const badNum = validateTaggedValue({ id: 't', key: 'n', type: 'number', value: 'abc' });
    expect(badNum.errors.length).toBeGreaterThan(0);

    const okJson = validateTaggedValue({ id: 't', key: 'obj', type: 'json', value: '{"a": 1}' });
    expect(okJson.errors).toEqual([]);
    expect(okJson.normalized.value).toBe('{"a":1}');
  });
});

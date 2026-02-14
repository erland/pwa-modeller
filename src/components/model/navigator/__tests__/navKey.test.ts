import { elementIdFromKey, elementIdsFromKeys, elementKey, isElementKey } from '../navKey';

describe('navKey helpers', () => {
  test('elementKey + isElementKey', () => {
    const k = elementKey('abc');
    expect(k).toBe('element:abc');
    expect(isElementKey(k)).toBe(true);
    expect(isElementKey('view:abc')).toBe(false);
  });

  test('elementIdFromKey', () => {
    expect(elementIdFromKey('element:123')).toBe('123');
    expect(elementIdFromKey('folder:123')).toBeNull();
    expect(elementIdFromKey('')).toBeNull();
  });

  test('elementIdsFromKeys', () => {
    const ids = elementIdsFromKeys(['element:a', 'view:x', 'element:b']);
    expect(ids).toEqual(['a', 'b']);
  });
});

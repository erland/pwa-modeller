import { externalKey } from '../../externalIds';
import { normalizeOverlayRefs, overlayExternalKey, toExternalIdRef, toOverlayExternalRef } from '../refs';

describe('domain overlay refs helpers', () => {
  test('toExternalIdRef parses optional scope in scheme as system@scope', () => {
    expect(toExternalIdRef({ scheme: 'xmi', value: 'EAID_1' })).toEqual({ system: 'xmi', id: 'EAID_1' });

    expect(toExternalIdRef({ scheme: '  xmi  @  model1  ', value: '  EAID_2  ' })).toEqual({
      system: 'xmi',
      id: 'EAID_2',
      scope: 'model1'
    });
  });

  test('toOverlayExternalRef encodes scope back into scheme', () => {
    expect(toOverlayExternalRef({ system: 'xmi', id: 'EAID_1' })).toEqual({ scheme: 'xmi', value: 'EAID_1' });
    expect(toOverlayExternalRef({ system: 'xmi', id: 'EAID_2', scope: 'model1' })).toEqual({
      scheme: 'xmi@model1',
      value: 'EAID_2'
    });
  });

  test('normalizeOverlayRefs drops invalid entries, dedupes, and stably sorts by externalKey', () => {
    const out = normalizeOverlayRefs([
      { scheme: ' xmi ', value: ' EAID_2 ' },
      { scheme: 'archimate-meff', value: 'EAID_1' },
      { scheme: 'xmi', value: 'EAID_2' }, // duplicate (same key)
      { scheme: 'xmi@scope1', value: 'EAID_3' },
      { scheme: ' ', value: 'EAID_BAD' },
      { scheme: 'xmi', value: '   ' }
    ]);

    expect(out).toEqual([
      { scheme: 'archimate-meff', value: 'EAID_1' },
      { scheme: 'xmi@scope1', value: 'EAID_3' },
      { scheme: 'xmi', value: 'EAID_2' }
    ]);

    // Sanity: the output order is sorted by the derived externalKey.
    const keys = out.map((r) => externalKey(toExternalIdRef(r)));
    expect(keys).toEqual([...keys].sort());
  });

  test('overlayExternalKey is the canonical key derived from internal externalKey', () => {
    const r = { scheme: 'xmi@model1', value: 'EAID_9' };
    expect(overlayExternalKey(r)).toBe(externalKey({ system: 'xmi', id: 'EAID_9', scope: 'model1' }));
  });
});

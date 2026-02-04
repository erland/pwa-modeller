import { clearRequiredOverlayTags, loadRequiredOverlayTags, saveRequiredOverlayTags } from '../requiredTags';

describe('overlay required tags', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('saves and loads required keys per signature', () => {
    const signature = 'ext-00001000';
    expect(loadRequiredOverlayTags(signature)).toEqual([]);

    saveRequiredOverlayTags(signature, ['owner', 'system', '  owner  ', '', 'stage']);
    // Should normalize and dedupe.
    expect(loadRequiredOverlayTags(signature)).toEqual(['owner', 'system', 'stage']);

    // Different signature has separate values.
    expect(loadRequiredOverlayTags('ext-other')).toEqual([]);
  });

  it('clears required keys per signature', () => {
    const signature = 'ext-00001001';
    saveRequiredOverlayTags(signature, ['a']);
    expect(loadRequiredOverlayTags(signature)).toEqual(['a']);
    clearRequiredOverlayTags(signature);
    expect(loadRequiredOverlayTags(signature)).toEqual([]);
  });
});

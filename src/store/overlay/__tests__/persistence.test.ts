import { clearPersistedOverlay, loadPersistedOverlayEntries, overlayStorageKey, persistOverlayEntries } from '../persistence';
import type { OverlayStoreEntry } from '../OverlayStore';

describe('overlay persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('persists and loads entries per signature', () => {
    const signature = 'ext-00000001';
    const entries: OverlayStoreEntry[] = [
      {
        entryId: 'ovl1',
        target: { kind: 'element', externalRefs: [{ scheme: 'xmi', value: 'EAID_1' }] },
        tags: { lineage: true }
      }
    ];

    persistOverlayEntries(signature, entries);
    const raw = window.localStorage.getItem(overlayStorageKey(signature));
    expect(typeof raw).toBe('string');

    const loaded = loadPersistedOverlayEntries(signature);
    expect(loaded).toEqual(entries);
  });

  it('clears persisted overlay for a signature', () => {
    const signature = 'ext-00000002';
    persistOverlayEntries(signature, []);
    expect(window.localStorage.getItem(overlayStorageKey(signature))).toBeTruthy();
    clearPersistedOverlay(signature);
    expect(window.localStorage.getItem(overlayStorageKey(signature))).toBeNull();
  });
});

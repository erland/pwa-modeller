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

  it('migrates legacy v1 persisted overlays on load', () => {
    const signature = 'ext-legacy-0001';
    const legacyKey = `pwa-modeller:overlayState:v1:${signature}`;
    const entries: OverlayStoreEntry[] = [
      {
        entryId: 'ovlLegacy',
        target: { kind: 'element', externalRefs: [{ scheme: 'archimate-meff', value: 'id' }] },
        tags: { foo: 'bar' }
      }
    ];
    const legacyEnvelope = {
      v: 1,
      signature,
      savedAt: new Date().toISOString(),
      entries
    };
    window.localStorage.setItem(legacyKey, JSON.stringify(legacyEnvelope));

    const loaded = loadPersistedOverlayEntries(signature);
    expect(loaded).toEqual(entries);

    // After load, it should have been migrated to the new key and legacy removed (best-effort).
    expect(window.localStorage.getItem(overlayStorageKey(signature))).toBeTruthy();
  });
});

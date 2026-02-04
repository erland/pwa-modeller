import { clearOverlayExportMarker, loadOverlayExportMarker, setOverlayExportMarker } from '../exportMarker';
import { OverlayStore } from '../OverlayStore';

describe('overlay export marker', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('writes and loads a marker for a signature', () => {
    const signature = 'ext-00000001';
    setOverlayExportMarker(signature, 12);
    const m = loadOverlayExportMarker(signature);
    expect(m).toBeTruthy();
    expect(m!.signature).toBe(signature);
    expect(m!.version).toBe(12);
    expect(typeof m!.exportedAt).toBe('string');
    expect(m!.exportedAt.length).toBeGreaterThan(10);
  });

  it('clears a marker for a signature', () => {
    const signature = 'ext-00000002';
    setOverlayExportMarker(signature, 1);
    expect(loadOverlayExportMarker(signature)).toBeTruthy();
    clearOverlayExportMarker(signature);
    expect(loadOverlayExportMarker(signature)).toBeNull();
  });

  it('export dirty behavior matches header logic', () => {
    // Mirrors AppShell logic:
    // overlayExportDirty = overlayCount > 0 && (!marker || marker.version !== overlayVersion)
    const signature = 'ext-00000003';
    const store = new OverlayStore();
    expect(store.getVersion()).toBe(0);

    // Start with no entries => not dirty regardless of marker
    const overlayCount0 = store.size;
    const marker0 = loadOverlayExportMarker(signature);
    const dirty0 = overlayCount0 > 0 && (!marker0 || marker0.version !== store.getVersion());
    expect(dirty0).toBe(false);

    // Add an entry => dirty (no marker yet)
    store.upsertEntry({ kind: 'element', externalRefs: [{ scheme: 'xmi', value: 'EAID_1' }], tags: { a: 1 } });
    const overlayCount1 = store.size;
    const marker1 = loadOverlayExportMarker(signature);
    const dirty1 = overlayCount1 > 0 && (!marker1 || marker1.version !== store.getVersion());
    expect(dirty1).toBe(true);

    // Mark as exported at current version => not dirty
    setOverlayExportMarker(signature, store.getVersion());
    const marker2 = loadOverlayExportMarker(signature);
    const dirty2 = store.size > 0 && (!marker2 || marker2.version !== store.getVersion());
    expect(dirty2).toBe(false);

    // Mutate overlay => version changes => dirty again
    const entryId = store.listEntries()[0].entryId;
    store.setTag(entryId, 'b', 'x');
    const marker3 = loadOverlayExportMarker(signature);
    const dirty3 = store.size > 0 && (!marker3 || marker3.version !== store.getVersion());
    expect(dirty3).toBe(true);
  });
});

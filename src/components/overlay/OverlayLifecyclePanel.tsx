import { useMemo, useState } from 'react';

import { computeModelSignature } from '../../domain';
import {
  downloadTextFile,
  overlayStore,
  sanitizeFileNameWithExtension,
  useModelStore
} from '../../store';
import { useOverlayStore } from '../../store/overlay';
import { clearPersistedOverlay } from '../../store/overlay/persistence';
import { clearOverlayExportMarker, setOverlayExportMarker } from '../../store/overlay/exportMarker';
import { importOverlayFileToStore, parseOverlayJson, serializeOverlayStoreToJson } from '../../store/overlay/io/jsonOverlay';

import { defaultOverlayFileBase, readFileAsText } from './overlayUiUtils';
import { HiddenFilePicker } from './shared/HiddenFilePicker';

type ToastKind = 'info' | 'success' | 'warn' | 'error';

export function OverlayLifecyclePanel() {
  const { model, fileName } = useModelStore((s) => ({ model: s.model, fileName: s.fileName }));
  const overlayEntryCount = useOverlayStore((s) => s.size);
  const overlayVersion = useOverlayStore((s) => s.getVersion());
  void overlayVersion;

  const [toast, setToast] = useState<{ kind: ToastKind; message: string } | null>(null);

  const signature = useMemo(() => {
    return model ? computeModelSignature(model) : '';
  }, [model]);

  const canUseOverlay = !!model;
  const canExport = canUseOverlay && overlayEntryCount > 0;
  const canClear = canUseOverlay && overlayEntryCount > 0;

  const doExport = (mode: 'save' | 'saveAs') => {
    if (!model) {
      setToast({ kind: 'warn', message: 'Load a model first before exporting an overlay.' });
      return;
    }
    if (overlayEntryCount === 0) {
      setToast({ kind: 'info', message: 'No overlay entries to export.' });
      return;
    }

    const base = defaultOverlayFileBase(model, fileName);
    const suggested = sanitizeFileNameWithExtension(`${base}-overlay`, 'json');
    const chosen =
      mode === 'saveAs'
        ? (window.prompt('File name for exported overlay (JSON):', suggested) ?? '').trim()
        : suggested;
    const fileOut = chosen || suggested;

    const json = serializeOverlayStoreToJson({ overlayStore, model });
    downloadTextFile(fileOut, json, 'application/json');
    if (signature) setOverlayExportMarker(signature, overlayStore.getVersion());
    setToast({ kind: 'success', message: `Overlay exported to ${fileOut}.` });
  };

  const doClear = () => {
    if (!model) return;
    if (overlayEntryCount === 0) {
      setToast({ kind: 'info', message: 'Overlay is already empty.' });
      return;
    }

    const ok = window.confirm(
      'Clear all overlay entries for this model?\n\nThis will remove overlay entries from memory and local storage for the current model signature.'
    );
    if (!ok) return;

    overlayStore.clear();
    if (signature) {
      clearPersistedOverlay(signature);
      clearOverlayExportMarker(signature);
    }
    setToast({ kind: 'success', message: 'Overlay cleared.' });
  };

  const onFileChosen = async (f: File | null) => {
    if (!model) {
      setToast({ kind: 'warn', message: 'Load a model first before importing an overlay.' });
      return;
    }
    if (!f) return;

    try {
      const text = await readFileAsText(f);
      const overlayFile = parseOverlayJson(text);
      const res = importOverlayFileToStore({ overlayStore, overlayFile, model, options: { strategy: 'merge' } });
      const w = res.warnings.length;
      const warnText = w ? ` (${w} warning${w === 1 ? '' : 's'})` : '';
      setToast({ kind: w ? 'warn' : 'success', message: `Overlay imported${warnText}: added=${res.stats.added}, updated=${res.stats.updated}, replaced=${res.stats.replaced}.` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Overlay import failed.';
      setToast({ kind: 'error', message: msg });
    }
  };

  return (
    <div className="crudCard" style={{ padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Overlay lifecycle</div>
          <div className="hintText" style={{ marginTop: 4, maxWidth: 820 }}>
            Load/save overlay as a JSON file and clear overlay entries for the currently loaded model.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <HiddenFilePicker accept=".json,application/json" onFile={onFileChosen}>
            {(open) => (
              <button type="button" className="shellButton" disabled={!canUseOverlay} onClick={open}>
                Load overlay…
              </button>
            )}
          </HiddenFilePicker>
          <button type="button" className="shellButton" disabled={!canExport} onClick={() => doExport('save')}>
            Save overlay…
          </button>
          <button type="button" className="shellButton" disabled={!canExport} onClick={() => doExport('saveAs')}>
            Save as…
          </button>
          <button type="button" className="shellButton" disabled={!canClear} onClick={doClear}>
            Clear
          </button>
        </div>
      </div>

      {toast ? (
        <div style={{ marginTop: 10 }}>
          <span className="shellStatusChip">{toast.message}</span>
        </div>
      ) : null}
    </div>
  );
}

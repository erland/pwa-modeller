import { useCallback, useMemo, useRef, useState } from 'react';

import { computeModelSignature } from '../../domain';
import {
  downloadTextFile,
  overlayStore,
  sanitizeFileNameWithExtension,
  useModelStore
} from '../../store';
import { useOverlayStore } from '../../store/overlay';
import { clearPersistedOverlay } from '../../store/overlay/persistence';
import { clearOverlayExportMarker, loadOverlayExportMarker, setOverlayExportMarker } from '../../store/overlay/exportMarker';
import { importOverlayFileToStore, parseOverlayJson, serializeOverlayStoreToJson } from '../../store/overlay/io/jsonOverlay';

import { defaultOverlayFileBase } from './overlayUiUtils';
import { readFileAsText } from '../shared/fileUtils';
import { Dialog } from '../dialog/Dialog';

type ToastKind = 'info' | 'success' | 'warn' | 'error';

function OverlayActionsMenuDialog({
  isOpen,
  onClose,
  actions
}: {
  isOpen: boolean;
  onClose: () => void;
  actions: { id: string; label: string; run: () => void; disabled?: boolean; title?: string }[];
}) {
  return (
    <Dialog title="Overlay actions" isOpen={isOpen} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {actions.map((a) => (
          <button
            key={a.id}
            type="button"
            className="shellButton"
            onClick={() => {
              onClose();
              a.run();
            }}
            disabled={a.disabled}
            title={a.title}
          >
            {a.label}
          </button>
        ))}
      </div>
    </Dialog>
  );
}

/**
 * AppShell actions slot for the Overlay workspace.
 * Replaces the old "Overlay lifecycle" card in the Overview tab.
 */
export function OverlayActions() {
  const { model, fileName } = useModelStore((s) => ({ model: s.model, fileName: s.fileName }));
  const overlayCount = useOverlayStore((s) => s.size);
  const overlayVersion = useOverlayStore((s) => s.getVersion());
  void overlayVersion;

  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<{ kind: ToastKind; message: string } | null>(null);
  const loadInputRef = useRef<HTMLInputElement | null>(null);

  const signature = useMemo(() => (model ? computeModelSignature(model) : ''), [model]);
  const canUseOverlay = !!model;
  const canExport = canUseOverlay && overlayCount > 0;
  const canClear = canUseOverlay && overlayCount > 0;

  // Read from localStorage each render so the UI updates immediately after an export.
  const exportMarker = signature ? loadOverlayExportMarker(signature) : null;
  const isDirty = useMemo(() => {
    if (!canUseOverlay) return false;
    if (overlayCount === 0) return false;
    // "Dirty" means the in-memory overlay differs from the last exported overlay file.
    if (!exportMarker) return true;
    return exportMarker.version !== overlayVersion;
  }, [canUseOverlay, overlayCount, exportMarker, overlayVersion]);

  const triggerLoadPicker = useCallback(() => {
    const el = loadInputRef.current;
    if (!el) return;
    el.value = '';
    el.click();
  }, []);

  const doExport = useCallback(
    (mode: 'save' | 'saveAs') => {
    if (!model) {
      setToast({ kind: 'warn', message: 'Load a model first before exporting an overlay.' });
      return;
    }
    if (overlayCount === 0) {
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
    },
    // overlayStore is a stable singleton; do not include in deps.
    [fileName, model, overlayCount, signature]
  );

  const doClear = useCallback(() => {
    if (!model) return;
    if (overlayCount === 0) {
      setToast({ kind: 'info', message: 'Overlay is already empty.' });
      return;
    }

    const msg =
      (isDirty
        ? 'You have unsaved overlay changes.\n\n'
        : '') +
      'Clear all overlay entries for this model?\n\nThis will remove overlay entries from memory and local storage for the current model signature.';
    const ok = window.confirm(msg);
    if (!ok) return;

    overlayStore.clear();
    if (signature) {
      clearPersistedOverlay(signature);
      clearOverlayExportMarker(signature);
    }
    setToast({ kind: 'success', message: 'Overlay cleared.' });
  // overlayStore is a stable singleton; do not include in deps.
  }, [isDirty, model, overlayCount, signature]);

  const onFileChosen = async (f: File | null) => {
    if (!model) {
      setToast({ kind: 'warn', message: 'Load a model first before importing an overlay.' });
      return;
    }
    if (!f) return;

    if (isDirty && overlayCount > 0) {
      const ok = window.confirm(
        'You have unsaved overlay changes.\n\nLoading an overlay may change or overwrite existing overlay entries. Continue?'
      );
      if (!ok) return;
    }

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

  type ActionItem = { id: string; label: string; run: () => void; disabled?: boolean; title?: string };

  const actions: ActionItem[] = useMemo(
    () => [
        {
          id: 'load',
          label: 'Load overlay…',
          run: triggerLoadPicker,
          disabled: !canUseOverlay,
          title: !canUseOverlay ? 'No model loaded' : undefined
        },
        {
          id: 'save',
          label: 'Save overlay…',
          run: () => doExport('save'),
          disabled: !canExport,
          title: !canUseOverlay ? 'No model loaded' : overlayCount === 0 ? 'No overlay entries' : undefined
        },
        {
          id: 'saveAs',
          label: 'Save overlay as…',
          run: () => doExport('saveAs'),
          disabled: !canExport
        },
        {
          id: 'clear',
          label: 'Clear overlay',
          run: doClear,
          disabled: !canClear
        }
      ],
    [canUseOverlay, canExport, canClear, overlayCount, triggerLoadPicker, doExport, doClear]
  );

  return (
    <>
      <button
        type="button"
        className="shellButton shellPrimaryAction"
        onClick={() => setMenuOpen(true)}
        title={isDirty ? 'Unsaved overlay changes' : undefined}
      >
        Overlay{isDirty ? ' *' : ''}
      </button>

      <input
        ref={loadInputRef}
        type="file"
        accept=".json,application/json"
        style={{ position: 'fixed', left: -10000, top: -10000, width: 1, height: 1, opacity: 0 }}
        onChange={(e) => {
          const f = e.currentTarget.files?.[0] ?? null;
          e.currentTarget.value = '';
          void onFileChosen(f);
        }}
      />

      <OverlayActionsMenuDialog isOpen={menuOpen} onClose={() => setMenuOpen(false)} actions={actions} />

      {toast ? (
        <span className="shellStatusChip" style={{ marginLeft: 8 }} title={toast.kind}>
          {toast.message}
        </span>
      ) : null}
    </>
  );
}

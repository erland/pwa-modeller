import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';

import type { Model, ModelMetadata } from '../../../domain';
import {
  deserializeModel,
  serializeModel,
  downloadTextFile,
  sanitizeFileName,
  sanitizeFileNameWithExtension,
  modelStore
} from '../../../store';
import {
  applyImportIR,
  ensureIssuesFromWarnings,
  formatUnknownCounts,
  importModel,
  type ImportReport
} from '../../../import';

function defaultFileName(metadata: ModelMetadata): string {
  return sanitizeFileName(metadata.name || 'model');
}

export type LastImportInfo = {
  fileName: string;
  format: string;
  importerId: string;
  counts: { folders: number; elements: number; relationships: number; views: number };
  report: ImportReport;
};

export type UseModelActionHandlersArgs = {
  model: Model | null;
  fileName: string | null;
  isDirty: boolean;
  navigate: NavigateFunction;
  onEditModelProps: () => void;
};

/**
 * Encapsulates all "command" / orchestration logic behind Model actions.
 * Keeps React UI components small and focused.
 */
export function useModelActionHandlers({ model, fileName, isDirty, navigate, onEditModelProps }: UseModelActionHandlersArgs) {
  const loadInputRef = useRef<HTMLInputElement | null>(null);

  const [overflowOpen, setOverflowOpen] = useState(false);

  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const [saveAsDialogOpen, setSaveAsDialogOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importReportOpen, setImportReportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [lastImport, setLastImport] = useState<LastImportInfo | null>(null);

  const saveAsDefault = useMemo(() => {
    if (!model) return 'model.json';
    return fileName ?? defaultFileName(model.metadata);
  }, [fileName, model]);

  const confirmReplaceIfDirty = useCallback((): boolean => {
    if (!isDirty) return true;
    return window.confirm('You have unsaved changes. Replace the current model?');
  }, [isDirty]);

  const doNewModel = useCallback(() => {
    if (!confirmReplaceIfDirty()) return;
    setNewDialogOpen(true);
    setNewName(model?.metadata.name ?? '');
    setNewDesc('');
  }, [confirmReplaceIfDirty, model]);

  const triggerLoadFilePicker = useCallback(() => {
    const el = loadInputRef.current;
    if (!el) return;
    // Allow choosing the same file again.
    el.value = '';
    el.click();
  }, []);

  const doLoad = useCallback(() => {
    if (!confirmReplaceIfDirty()) return;
    triggerLoadFilePicker();
  }, [confirmReplaceIfDirty, triggerLoadFilePicker]);

  async function readFileAsText(file: File): Promise<string> {
    // Prefer the modern File.text() API when available.
    const anyFile = file as unknown as { text?: () => Promise<string> };
    if (typeof anyFile.text === 'function') {
      return await anyFile.text();
    }

    // Jest/jsdom (and some older browsers) may not implement File.text().
    // FileReader is widely supported and works in tests.
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.readAsText(file);
    });
  }

  const tryOpenNativeModel = useCallback(
    async (file: File): Promise<boolean> => {
      // Only attempt native open for .json (or json MIME) to avoid expensive reads for large XML/XMI.
      const name = (file.name || '').toLowerCase();
      const isJson = name.endsWith('.json') || (file.type || '').includes('json');
      if (!isJson) return false;

      try {
        const json = await readFileAsText(file);
        const loadedModel = deserializeModel(json);
        const safeName = sanitizeFileNameWithExtension(file.name || 'model.json', 'json');
        modelStore.loadModel(loadedModel, safeName);
        navigate('/');
        return true;
      } catch {
        // Not a native model JSON (or invalid) - fall back to import.
        return false;
      }
    },
    [navigate]
  );

  const onImportFileChosen = useCallback(
    async (file: File) => {
      setImportDialogOpen(true);

      setImporting(true);
      setImportError(null);
      try {
        const result = await importModel(file);
        const counts = {
          folders: result.ir.folders.length,
          elements: result.ir.elements.length,
          relationships: result.ir.relationships.length,
          views: result.ir.views?.length ?? 0
        };

        const applied = applyImportIR(result.ir, result.report, {
          sourceSystem: result.format || result.report?.source || result.importerId
        });

        setLastImport({
          fileName: file.name || 'import',
          format: result.format || result.importerId,
          importerId: result.importerId,
          counts,
          report: applied.report
        });

        setImportDialogOpen(false);
        setImportReportOpen(true);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setImportError(msg);
      } finally {
        setImporting(false);
      }
    },
    []
  );

  const onLoadFileChosen = useCallback(
    async (file: File | null) => {
      if (!file) return;
      if (!confirmReplaceIfDirty()) return;

      // Native JSON open first when applicable, otherwise import.
      const opened = await tryOpenNativeModel(file);
      if (opened) return;

      // Import path (shows progress/errors via ImportDialog).
      setImportError(null);
      await onImportFileChosen(file);
    },
    [confirmReplaceIfDirty, onImportFileChosen, tryOpenNativeModel]
  );

  const triggerDownload = useCallback(
    (name: string) => {
      if (!model) return;
      const json = serializeModel(model);
      const finalName = sanitizeFileName(name);
      downloadTextFile(finalName, json);
      modelStore.setFileName(finalName);
      modelStore.markSaved();
    },
    [model]
  );

  const doSave = useCallback(() => {
    if (!model) return;
    if (fileName) {
      triggerDownload(fileName);
      return;
    }
    setSaveAsName(saveAsDefault);
    setSaveAsDialogOpen(true);
  }, [fileName, model, saveAsDefault, triggerDownload]);

  const doSaveAs = useCallback(() => {
    if (!model) return;
    setSaveAsName(saveAsDefault);
    setSaveAsDialogOpen(true);
  }, [model, saveAsDefault]);

  const doProperties = useCallback(() => {
    onEditModelProps();
  }, [onEditModelProps]);

  const doAbout = useCallback(() => {
    navigate('/about');
  }, [navigate]);

  // Global shortcut (Ctrl/Cmd+S) can request a save.
  useEffect(() => {
    function onRequestSave() {
      doSave();
    }
    window.addEventListener('pwa-modeller:request-save', onRequestSave as EventListener);
    return () => window.removeEventListener('pwa-modeller:request-save', onRequestSave as EventListener);
  }, [doSave]);

  const downloadImportReport = useCallback(() => {
    if (!lastImport) return;
    const r = lastImport.report;

    const issues = ensureIssuesFromWarnings(r);
    const totals = { info: 0, warn: 0, error: 0 } as Record<'info' | 'warn' | 'error', number>;
    for (const i of issues) {
      if (i.level === 'info') totals.info += i.count;
      if (i.level === 'warn') totals.warn += i.count;
      if (i.level === 'error') totals.error += i.count;
    }

    const fmtSample = (s: unknown): string => {
      if (s == null || typeof s !== 'object') return String(s);
      const obj = s as Record<string, unknown>;
      const keys = Object.keys(obj).slice(0, 8);
      const parts: string[] = [];
      for (const k of keys) {
        const v = obj[k];
        if (v == null) continue;
        if (Array.isArray(v)) {
          const arr = v as unknown[];
          const shown = arr.slice(0, 3).map((x) => String(x)).join(', ');
          parts.push(`${k}=[${shown}${arr.length > 3 ? ', …' : ''}]`);
        } else {
          parts.push(`${k}=${String(v)}`);
        }
      }
      return parts.join(' ');
    };

    const lines: string[] = [];
    lines.push(`# Import report`);
    lines.push('');
    lines.push(`- File: ${lastImport.fileName}`);
    lines.push(`- Format: ${lastImport.format}`);
    lines.push(`- Importer: ${lastImport.importerId}`);
    lines.push(`- Source: ${r.source}`);
    lines.push(
      `- Counts: folders=${lastImport.counts.folders}, elements=${lastImport.counts.elements}, relationships=${lastImport.counts.relationships}, views=${lastImport.counts.views}`
    );
    lines.push(`- Issue totals: errors=${totals.error}, warnings=${totals.warn}, info=${totals.info}`);
    lines.push('');

    if (issues.length) {
      const levelRank = (lvl: string) => (lvl === 'error' ? 0 : lvl === 'warn' ? 1 : 2);
      const sorted = [...issues].sort(
        (a, b) => levelRank(a.level) - levelRank(b.level) || b.count - a.count || a.message.localeCompare(b.message)
      );

      lines.push('## Issues (grouped)');
      for (const i of sorted) {
        const tag = i.level.toUpperCase();
        const code = i.code ? ` (${i.code})` : '';
        lines.push(`- **${tag}** x${i.count}${code}: ${i.message}`);
        const samples = (i.samples ?? []).slice(0, 3);
        for (const s of samples) {
          lines.push(`  - sample: ${fmtSample(s)}`);
        }
      }
      lines.push('');
    }

    const elemUnknown = formatUnknownCounts(r.unknownElementTypes);
    if (elemUnknown.length) {
      lines.push('## Unknown element types');
      for (const [k, v] of elemUnknown) lines.push(`- ${k}: ${v}`);
      lines.push('');
    }
    const relUnknown = formatUnknownCounts(r.unknownRelationshipTypes);
    if (relUnknown.length) {
      lines.push('## Unknown relationship types');
      for (const [k, v] of relUnknown) lines.push(`- ${k}: ${v}`);
      lines.push('');
    }
    if (issues.length === 0 && elemUnknown.length === 0 && relUnknown.length === 0) {
      lines.push('No issues detected.');
    }
    downloadTextFile(
      sanitizeFileNameWithExtension(`import-report-${lastImport.fileName}`, 'md'),
      lines.join('\n'),
      'text/markdown'
    );
  }, [lastImport]);

  return {
    // refs / inputs
    loadInputRef,
    onLoadFileChosen,
    triggerLoadFilePicker,

    // dialogs / menu
    overflowOpen,
    setOverflowOpen,

    newDialogOpen,
    setNewDialogOpen,
    newName,
    setNewName,
    newDesc,
    setNewDesc,

    saveAsDialogOpen,
    setSaveAsDialogOpen,
    saveAsName,
    setSaveAsName,

    importDialogOpen,
    setImportDialogOpen,
    importReportOpen,
    setImportReportOpen,
    importing,
    importError,
    lastImport,

    // commands
    doNewModel,
    doLoad,
    doSave,
    doSaveAs,
    doProperties,
    doAbout,
    triggerDownload,
    saveAsDefault,
    downloadImportReport,

    // helpers
    confirmReplaceIfDirty,
    setImportError
  };
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';

import type { ModelMetadata } from '../../../domain';
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
  model: any | null;
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
  const openInputRef = useRef<HTMLInputElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

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

  const doOpenModel = useCallback(() => {
    if (!confirmReplaceIfDirty()) return;
    openInputRef.current?.click();
  }, [confirmReplaceIfDirty]);

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

  const onFileChosen = useCallback(
    async (file: File | null) => {
      if (!file) return;
      try {
        const json = await readFileAsText(file);
        const loadedModel = deserializeModel(json);
        const safeName = sanitizeFileNameWithExtension(file.name || 'model.json', 'json');
        modelStore.loadModel(loadedModel, safeName);
        navigate('/');
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        window.alert(`Failed to open model: ${msg}`);
      }
    },
    [navigate]
  );

  const triggerImportFilePicker = useCallback(() => {
    const el = importInputRef.current;
    if (!el) return;
    // Allow choosing the same file again.
    el.value = '';
    el.click();
  }, []);

  const doImport = useCallback(() => {
    if (!confirmReplaceIfDirty()) return;
    setImportError(null);
    // Open the dialog (shows progress/errors) and immediately open the file picker.
    setImportDialogOpen(true);
    triggerImportFilePicker();
  }, [confirmReplaceIfDirty, triggerImportFilePicker]);

  const onImportFileChosen = useCallback(
    async (file: File | null) => {
      if (!file) return;

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
    lines.push('');
    if (r.warnings.length) {
      lines.push('## Warnings');
      for (const w of r.warnings) lines.push(`- ${w}`);
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
    if (!r.warnings.length && elemUnknown.length === 0 && relUnknown.length === 0) {
      lines.push('No warnings.');
    }
    downloadTextFile(
      sanitizeFileNameWithExtension(`import-report-${lastImport.fileName}`, 'md'),
      lines.join('\n'),
      'text/markdown'
    );
  }, [lastImport]);

  return {
    // refs / inputs
    openInputRef,
    importInputRef,
    onFileChosen,
    onImportFileChosen,
    triggerImportFilePicker,

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
    doOpenModel,
    doImport,
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

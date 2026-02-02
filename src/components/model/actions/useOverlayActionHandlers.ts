import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Model } from '../../../domain';
import { computeModelSignature } from '../../../domain';
import { buildOverlayModelExternalIdIndex } from '../../../domain/overlay';
import {
  downloadTextFile,
  sanitizeFileName,
  sanitizeFileNameWithExtension,
  overlayStore
} from '../../../store';
import type { ResolveReport } from '../../../store/overlay/resolve';
import { resolveOverlayAgainstModel } from '../../../store/overlay/resolve';
import {
  type OverlayImportWarning,
  parseOverlayJson,
  serializeOverlayStoreToJson,
  importOverlayFileToStore
} from '../../../store/overlay';
import { useOverlayStore } from '../../../store/overlay';

export type LastOverlayImportInfo = {
  fileName: string;
  warnings: string[];
  report: ResolveReport;
};

export type UseOverlayActionHandlersArgs = {
  model: Model | null;
  fileName: string | null;
};

type ToastState = { message: string; kind: 'info' | 'success' | 'warn' | 'error' };

function defaultOverlayFileBase(model: Model, fileName: string | null): string {
  const fromFile = fileName ? fileName.replace(/\.[^.]+$/, '') : '';
  const fromMeta = (model.metadata?.name || '').trim();
  const base = fromMeta || fromFile || 'model';
  return sanitizeFileName(base);
}

async function readFileAsText(file: File): Promise<string> {
  const anyFile = file as unknown as { text?: () => Promise<string> };
  if (typeof anyFile.text === 'function') return await anyFile.text();

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsText(file);
  });
}

function summarizeWarnings(warnings: string[]): string {
  if (!warnings.length) return '';
  if (warnings.length === 1) return ` (1 warning)`;
  return ` (${warnings.length} warnings)`;
}

function resolveSummary(report: ResolveReport): string {
  const { attached, orphan, ambiguous } = report.counts;
  return `attached=${attached}, orphan=${orphan}, ambiguous=${ambiguous}`;
}

function warningToText(w: OverlayImportWarning): string {
  if (w.type === 'signature-mismatch') {
    const a = w.fileSignature ? `file=${w.fileSignature}` : 'file=?';
    const b = w.currentSignature ? `current=${w.currentSignature}` : 'current=?';
    return `signature mismatch (${a}, ${b})`;
  }
  if (w.type === 'merge-conflict-multiple-existing') {
    const ref = w.importedEntryId ? `entry=${w.importedEntryId}` : `entry#${w.importedEntryIndex}`;
    return `merge conflict: ${ref} matched multiple existing entries (${w.matchedEntryIds.join(', ')})`;
  }
  return `dropped invalid entry #${w.importedEntryIndex}: ${w.reason}`;
}

/**
 * Encapsulates all orchestration logic for Overlay import/export actions.
 */
export function useOverlayActionHandlers({ model, fileName }: UseOverlayActionHandlersArgs) {
  const overlayLoadInputRef = useRef<HTMLInputElement | null>(null);

  const [overlayImportDialogOpen, setOverlayImportDialogOpen] = useState(false);
  const [overlayImporting, setOverlayImporting] = useState(false);
  const [overlayImportError, setOverlayImportError] = useState<string | null>(null);

  const [overlayReportOpen, setOverlayReportOpen] = useState(false);
  const [lastOverlayImport, setLastOverlayImport] = useState<LastOverlayImportInfo | null>(null);

  const [overlayManageOpen, setOverlayManageOpen] = useState(false);

  const [toast, setToast] = useState<ToastState | null>(null);

  const overlayEntryCount = useOverlayStore((s) => s.size);
  const overlayHasEntries = overlayEntryCount > 0;

  const liveReport = useMemo(() => {
    if (!model) return null;
    if (!overlayHasEntries) {
      return {
        total: 0,
        attached: [],
        orphan: [],
        ambiguous: [],
        counts: { attached: 0, orphan: 0, ambiguous: 0 }
      } as ResolveReport;
    }
    const idx = buildOverlayModelExternalIdIndex(model);
    return resolveOverlayAgainstModel(overlayStore.listEntries(), idx);
  }, [model, overlayHasEntries, overlayEntryCount]);

  const overlayHasIssues = !!liveReport && (liveReport.counts.orphan > 0 || liveReport.counts.ambiguous > 0);
  const overlayReportAvailable = !!lastOverlayImport;

  const triggerOverlayLoadFilePicker = useCallback(() => {
    const el = overlayLoadInputRef.current;
    if (!el) return;
    el.value = '';
    el.click();
  }, []);

  const doOverlayImport = useCallback(() => {
    if (!model) {
      setToast({ kind: 'warn', message: 'Load a model first before importing an overlay.' });
      return;
    }
    setOverlayImportError(null);
    setOverlayImportDialogOpen(true);
  }, [model]);

  const doOverlayExport = useCallback(() => {
    if (!model) {
      setToast({ kind: 'warn', message: 'Load a model first before exporting an overlay.' });
      return;
    }

    const base = defaultOverlayFileBase(model, fileName);
    const json = serializeOverlayStoreToJson({ overlayStore, model });
    downloadTextFile(sanitizeFileNameWithExtension(`${base}-overlay`, 'json'), json, 'application/json');
    setToast({ kind: 'success', message: 'Overlay exported.' });
  }, [fileName, model]);

  const onOverlayFileChosen = useCallback(
    async (file: File | null) => {
      if (!file) return;
      if (!model) return;

      setOverlayImporting(true);
      setOverlayImportError(null);
      try {
        const text = await readFileAsText(file);
        const overlayFile = parseOverlayJson(text);

        const result = importOverlayFileToStore({ overlayStore, overlayFile, model });

        const report = result.resolveReport;
        const warnings = result.warnings.map(warningToText);

        setLastOverlayImport({ fileName: file.name || 'overlay.json', warnings, report });
        setOverlayImportDialogOpen(false);

        const warnSuffix = summarizeWarnings(warnings);
        const msg = `Overlay imported: ${resolveSummary(report)}${warnSuffix}.`;
        setToast({ kind: warnings.length || report.counts.orphan || report.counts.ambiguous ? 'warn' : 'success', message: msg });

        // Auto-open report dialog when there are actionable issues.
        if (warnings.length > 0 || report.counts.orphan > 0 || report.counts.ambiguous > 0) {
          setOverlayReportOpen(true);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setOverlayImportError(msg);
      } finally {
        setOverlayImporting(false);
      }
    },
    [model]
  );

  const doOverlayReport = useCallback(() => {
    if (!lastOverlayImport) return;
    setOverlayReportOpen(true);
  }, [lastOverlayImport]);

  const doOverlayManage = useCallback(() => {
    if (!model) {
      setToast({ kind: 'warn', message: 'Load a model first before managing overlay entries.' });
      return;
    }
    if (!overlayHasEntries) {
      setToast({ kind: 'info', message: 'No overlay entries to manage.' });
      return;
    }
    setOverlayManageOpen(true);
  }, [model, overlayHasEntries]);

  const downloadOverlayResolveReport = useCallback(() => {
    if (!model) return;
    if (!lastOverlayImport) return;

    const sig = computeModelSignature(model);
    const { fileName: srcName, warnings, report } = lastOverlayImport;

    const lines: string[] = [];
    lines.push('# Overlay resolve report');
    lines.push('');
    lines.push(`- Source file: ${srcName}`);
    lines.push(`- Model signature: ${sig}`);
    lines.push(
      `- Totals: total=${report.total}, attached=${report.counts.attached}, orphan=${report.counts.orphan}, ambiguous=${report.counts.ambiguous}`
    );
    if (warnings.length) {
      lines.push('');
      lines.push('## Warnings');
      for (const w of warnings) lines.push(`- ${w}`);
    }

    const limit = 50;
    if (report.orphan.length) {
      lines.push('');
      lines.push(`## Orphans (showing up to ${limit})`);
      for (const o of report.orphan.slice(0, limit)) {
        lines.push(`- entry=${o.entryId} keys=${o.externalKeys.join(', ')}`);
      }
      if (report.orphan.length > limit) lines.push(`- … and ${report.orphan.length - limit} more`);
    }

    if (report.ambiguous.length) {
      lines.push('');
      lines.push(`## Ambiguous (showing up to ${limit})`);
      for (const a of report.ambiguous.slice(0, limit)) {
        const c = a.candidates.map((x) => `${x.kind}:${x.id}`).join(', ');
        lines.push(`- entry=${a.entryId} candidates=[${c}]`);
      }
      if (report.ambiguous.length > limit) lines.push(`- … and ${report.ambiguous.length - limit} more`);
    }

    downloadTextFile(
      sanitizeFileNameWithExtension(`overlay-resolve-report-${srcName}`, 'md'),
      lines.join('\n'),
      'text/markdown'
    );
  }, [lastOverlayImport, model]);

  // Auto-dismiss toast.
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(t);
  }, [toast]);

  return {
    overlayLoadInputRef,
    onOverlayFileChosen,
    triggerOverlayLoadFilePicker,

    overlayImportDialogOpen,
    setOverlayImportDialogOpen,
    overlayImporting,
    overlayImportError,

    overlayReportOpen,
    setOverlayReportOpen,
    overlayManageOpen,
    setOverlayManageOpen,
    lastOverlayImport,

    doOverlayImport,
    doOverlayExport,
    doOverlayReport,
    doOverlayManage,
    downloadOverlayResolveReport,

    overlayHasEntries,
    overlayHasIssues,
    overlayReportAvailable,
    liveReport,

    toast,
    setToast
  };
}

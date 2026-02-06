import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Element, Model, Relationship } from '../../../domain';
import { computeModelSignature } from '../../../domain';
import { buildOverlayModelExternalIdIndex } from '../../../domain/overlay';
import {
  downloadTextFile,
  sanitizeFileNameWithExtension,
  overlayStore
} from '../../../store';
import type { ResolveReport } from '../../../store/overlay/resolve';
import { resolveOverlayAgainstModel } from '../../../store/overlay/resolve';
import {
  type OverlayImportWarning,
  parseOverlayJson,
  serializeOverlayStoreToJson,
  importOverlayFileToStore,
  type SurveyExportOptions,
  type SurveyImportOptions,
  type SurveyTargetSet,
  importOverlaySurveyCsvToStore,
  serializeOverlaySurveyCsv
} from '../../../store/overlay';
import { useOverlayStore } from '../../../store/overlay';

import { defaultOverlayFileBase } from '../../overlay/overlayUiUtils';
import { readFileAsText } from '../../shared/fileUtils';

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
  const overlaySurveyLoadInputRef = useRef<HTMLInputElement | null>(null);

  const [overlayImportDialogOpen, setOverlayImportDialogOpen] = useState(false);
  const [overlayImporting, setOverlayImporting] = useState(false);
  const [overlayImportError, setOverlayImportError] = useState<string | null>(null);

  const [surveyExportDialogOpen, setSurveyExportDialogOpen] = useState(false);
  const [surveyImportDialogOpen, setSurveyImportDialogOpen] = useState(false);
  const [surveyImporting, setSurveyImporting] = useState(false);
  const [surveyImportError, setSurveyImportError] = useState<string | null>(null);

  const [surveyTargetSet, setSurveyTargetSet] = useState<SurveyTargetSet>('elements');
  const [surveyElementTypes, setSurveyElementTypes] = useState<string[]>([]);
  const [surveyRelationshipTypes, setSurveyRelationshipTypes] = useState<string[]>([]);
  const [surveyTagKeysText, setSurveyTagKeysText] = useState<string>('');
  const [surveyImportOptions, setSurveyImportOptions] = useState<SurveyImportOptions>({ blankMode: 'ignore' });

  const [overlayReportOpen, setOverlayReportOpen] = useState(false);
  const [lastOverlayImport, setLastOverlayImport] = useState<LastOverlayImportInfo | null>(null);

  const [overlayManageOpen, setOverlayManageOpen] = useState(false);

  const [toast, setToast] = useState<ToastState | null>(null);

  const overlayEntryCount = useOverlayStore((s) => s.size);
  const overlayHasEntries = overlayEntryCount > 0;

  const availableSurveyElementTypes = useMemo(() => {
    if (!model) return [] as string[];
    const set = new Set<string>();
    for (const el of Object.values(model.elements ?? {})) {
      const t = String(el.type ?? '').trim();
      if (t) set.add(t);
    }
    return [...set.values()].sort();
  }, [model]);

  const availableSurveyRelationshipTypes = useMemo(() => {
    if (!model) return [] as string[];
    const set = new Set<string>();
    for (const rel of Object.values(model.relationships ?? {})) {
      const t = String(rel.type ?? '').trim();
      if (t) set.add(t);
    }
    return [...set.values()].sort();
  }, [model]);

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
  }, [model, overlayHasEntries]);

  const overlayHasIssues = !!liveReport && (liveReport.counts.orphan > 0 || liveReport.counts.ambiguous > 0);
  const overlayReportAvailable = !!lastOverlayImport;

  const triggerOverlayLoadFilePicker = useCallback(() => {
    const el = overlayLoadInputRef.current;
    if (!el) return;
    el.value = '';
    el.click();
  }, []);

  const triggerOverlaySurveyLoadFilePicker = useCallback(() => {
    const el = overlaySurveyLoadInputRef.current;
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

  const modelSignature = useMemo(() => (model ? computeModelSignature(model) : ''), [model]);

  useEffect(() => {
    // When a new model is loaded/imported, reset survey type filters to "all".
    setSurveyElementTypes([]);
    setSurveyRelationshipTypes([]);
  }, [modelSignature]);

  const doOverlaySurveyExport = useCallback(() => {
    if (!model) {
      setToast({ kind: 'warn', message: 'Load a model first before exporting a survey.' });
      return;
    }
    setSurveyExportDialogOpen(true);
  }, [model]);

  const doOverlaySurveyImport = useCallback(() => {
    if (!model) {
      setToast({ kind: 'warn', message: 'Load a model first before importing a survey.' });
      return;
    }
    setSurveyImportError(null);
    setSurveyImportDialogOpen(true);
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

  const doOverlaySurveyExportNow = useCallback(() => {
    if (!model) return;
    const base = defaultOverlayFileBase(model, fileName);

    const tagKeys = surveyTagKeysText
      .split(/[\n,]/g)
      .map((s) => s.trim())
      .filter((s) => !!s);

    const options: SurveyExportOptions = {
      targetSet: surveyTargetSet,
      elementTypes: surveyElementTypes,
      relationshipTypes: surveyRelationshipTypes,
      tagKeys,
      prefillFromEffectiveTags: true
    };

    const csv = serializeOverlaySurveyCsv({ model, overlayStore, options });
    downloadTextFile(sanitizeFileNameWithExtension(`${base}-overlay-survey`, 'csv'), csv, 'text/csv');
    setToast({ kind: 'success', message: 'Overlay survey exported.' });
    setSurveyExportDialogOpen(false);
  }, [fileName, model, surveyTagKeysText, surveyTargetSet, surveyElementTypes, surveyRelationshipTypes]);

  const suggestSurveyKeys = useCallback(() => {
    if (!model) return;

    const set = new Set<string>();

    // Overlay keys
    for (const e of overlayStore.listEntries()) {
      for (const k0 of Object.keys(e.tags ?? {})) {
        const k = (k0 ?? '').toString().trim();
        if (k) set.add(k);
      }
    }

    // Core tagged values keys
    for (const el of Object.values(model.elements ?? {})) {
      const e = el as Element;
      for (const tv of e.taggedValues ?? []) {
        const k = (tv?.key ?? '').toString().trim();
        if (k) set.add(k);
      }
    }
    for (const rel of Object.values(model.relationships ?? {})) {
      const r = rel as Relationship;
      for (const tv of r.taggedValues ?? []) {
        const k = (tv?.key ?? '').toString().trim();
        if (k) set.add(k);
      }
    }

    const keys = [...set.values()]
      .map((s) => s.trim())
      .filter((s) => !!s)
      .sort()
      .slice(0, 40);

    setSurveyTagKeysText(keys.join('\n'));
    setToast({ kind: 'info', message: keys.length ? `Suggested ${keys.length} keys.` : 'No tag keys found to suggest.' });
  }, [model]);

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

  const onOverlaySurveyFileChosen = useCallback(
    async (file: File | null) => {
      if (!file) return;
      if (!model) return;

      setSurveyImporting(true);
      setSurveyImportError(null);
      try {
        const text = await readFileAsText(file);

        const result = importOverlaySurveyCsvToStore({ model, overlayStore, csvText: text, options: surveyImportOptions });

        const report = result.resolveReport;
        const warnings = result.warnings;

        setLastOverlayImport({ fileName: file.name || 'overlay-survey.csv', warnings, report });
        setSurveyImportDialogOpen(false);

        const warnSuffix = summarizeWarnings(warnings);
        const msg = `Survey imported: ${resolveSummary(report)}${warnSuffix}.`;
        setToast({ kind: warnings.length || report.counts.orphan || report.counts.ambiguous ? 'warn' : 'success', message: msg });

        if (warnings.length > 0 || report.counts.orphan > 0 || report.counts.ambiguous > 0) {
          setOverlayReportOpen(true);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setSurveyImportError(msg);
      } finally {
        setSurveyImporting(false);
      }
    },
    [model, surveyImportOptions]
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
    overlaySurveyLoadInputRef,
    onOverlayFileChosen,
    onOverlaySurveyFileChosen,
    triggerOverlayLoadFilePicker,
    triggerOverlaySurveyLoadFilePicker,

    overlayImportDialogOpen,
    setOverlayImportDialogOpen,
    overlayImporting,
    overlayImportError,

    surveyExportDialogOpen,
    setSurveyExportDialogOpen,
    surveyTargetSet,
    setSurveyTargetSet,
    availableSurveyElementTypes,
    availableSurveyRelationshipTypes,
    surveyElementTypes,
    setSurveyElementTypes,
    surveyRelationshipTypes,
    setSurveyRelationshipTypes,
    surveyTagKeysText,
    setSurveyTagKeysText,
    doOverlaySurveyExportNow,
    suggestSurveyKeys,

    surveyImportDialogOpen,
    setSurveyImportDialogOpen,
    surveyImporting,
    surveyImportError,
    surveyImportOptions,
    setSurveyImportOptions,

    overlayReportOpen,
    setOverlayReportOpen,
    overlayManageOpen,
    setOverlayManageOpen,
    lastOverlayImport,

    doOverlayImport,
    doOverlayExport,
    doOverlaySurveyExport,
    doOverlaySurveyImport,
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

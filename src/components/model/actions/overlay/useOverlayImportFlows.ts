import { useCallback, useMemo, useRef, useState } from 'react';

import type { Model } from '../../../../domain';
import { buildOverlayModelExternalIdIndex } from '../../../../domain/overlay';
import { overlayStore } from '../../../../store';
import type { ResolveReport } from '../../../../store/overlay/resolve';
import { resolveOverlayAgainstModel } from '../../../../store/overlay/resolve';
import {
  importOverlayFileToStore,
  importOverlaySurveyCsvToStore,
  parseOverlayJson,
  serializeOverlayStoreToJson,
  serializeOverlaySurveyCsv,
  type SurveyExportOptions,
  type SurveyImportOptions,
  type SurveyTargetSet
} from '../../../../store/overlay';
import { useOverlayStore } from '../../../../store/overlay';

import { defaultOverlayFileBase } from '../../../overlay/overlayUiUtils';
import { readFileAsText } from '../../../shared/fileUtils';
import { downloadTextFile, sanitizeFileNameWithExtension } from '../../../../store';

import { resolveSummary, summarizeWarnings, warningToText } from './overlayActionUtils';
import type { ToastState } from './useOverlayToast';

export type LastOverlayImportInfo = {
  fileName: string;
  warnings: string[];
  report: ResolveReport;
};

type Args = {
  model: Model | null;
  fileName: string | null;
  setToast: (t: ToastState | null) => void;
  surveyTargetSet: SurveyTargetSet;
  surveyElementTypes: string[];
  surveyRelationshipTypes: string[];
  surveyTagKeysText: string;
  surveyImportOptions: SurveyImportOptions;
};

export function useOverlayImportFlows(args: Args) {
  const {
    model,
    fileName,
    setToast,
    surveyTargetSet,
    surveyElementTypes,
    surveyRelationshipTypes,
    surveyTagKeysText,
    surveyImportOptions
  } = args;

  const overlayLoadInputRef = useRef<HTMLInputElement | null>(null);
  const overlaySurveyLoadInputRef = useRef<HTMLInputElement | null>(null);

  const [overlayImportDialogOpen, setOverlayImportDialogOpen] = useState(false);
  const [overlayImporting, setOverlayImporting] = useState(false);
  const [overlayImportError, setOverlayImportError] = useState<string | null>(null);

  const [surveyExportDialogOpen, setSurveyExportDialogOpen] = useState(false);
  const [surveyImportDialogOpen, setSurveyImportDialogOpen] = useState(false);
  const [surveyImporting, setSurveyImporting] = useState(false);
  const [surveyImportError, setSurveyImportError] = useState<string | null>(null);

  const [lastOverlayImport, setLastOverlayImport] = useState<LastOverlayImportInfo | null>(null);

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
  }, [model, setToast]);

  const doOverlaySurveyExport = useCallback(() => {
    if (!model) {
      setToast({ kind: 'warn', message: 'Load a model first before exporting a survey.' });
      return;
    }
    setSurveyExportDialogOpen(true);
  }, [model, setToast]);

  const doOverlaySurveyImport = useCallback(() => {
    if (!model) {
      setToast({ kind: 'warn', message: 'Load a model first before importing a survey.' });
      return;
    }
    setSurveyImportError(null);
    setSurveyImportDialogOpen(true);
  }, [model, setToast]);

  const doOverlayExport = useCallback(() => {
    if (!model) {
      setToast({ kind: 'warn', message: 'Load a model first before exporting an overlay.' });
      return;
    }

    const base = defaultOverlayFileBase(model, fileName);
    const json = serializeOverlayStoreToJson({ overlayStore, model });
    downloadTextFile(sanitizeFileNameWithExtension(`${base}-overlay`, 'json'), json, 'application/json');
    setToast({ kind: 'success', message: 'Overlay exported.' });
  }, [fileName, model, setToast]);

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
  }, [fileName, model, surveyTagKeysText, surveyTargetSet, surveyElementTypes, surveyRelationshipTypes, setToast]);

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
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setOverlayImportError(msg);
      } finally {
        setOverlayImporting(false);
      }
    },
    [model, setToast]
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
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setSurveyImportError(msg);
      } finally {
        setSurveyImporting(false);
      }
    },
    [model, surveyImportOptions, setToast]
  );

  return {
    overlayLoadInputRef,
    overlaySurveyLoadInputRef,
    triggerOverlayLoadFilePicker,
    triggerOverlaySurveyLoadFilePicker,
    overlayImportDialogOpen,
    setOverlayImportDialogOpen,
    overlayImporting,
    overlayImportError,
    surveyExportDialogOpen,
    setSurveyExportDialogOpen,
    surveyImportDialogOpen,
    setSurveyImportDialogOpen,
    surveyImporting,
    surveyImportError,
    onOverlayFileChosen,
    onOverlaySurveyFileChosen,
    lastOverlayImport,
    setLastOverlayImport,
    doOverlayImport,
    doOverlayExport,
    doOverlaySurveyExport,
    doOverlaySurveyImport,
    doOverlaySurveyExportNow,
    overlayHasEntries,
    overlayHasIssues,
    overlayReportAvailable,
    liveReport
  };
}

import { useCallback, useState } from 'react';

import type { Model } from '../../../domain';
import { computeModelSignature } from '../../../domain';
import { downloadTextFile, sanitizeFileNameWithExtension } from '../../../store';

import { useOverlaySurveyState } from './overlay/useOverlaySurveyState';
import { useOverlayToast } from './overlay/useOverlayToast';
import { useOverlayImportFlows } from './overlay/useOverlayImportFlows';

export type { LastOverlayImportInfo } from './overlay/useOverlayImportFlows';

export type UseOverlayActionHandlersArgs = {
  model: Model | null;
  fileName: string | null;
};


/**
 * Encapsulates all orchestration logic for Overlay import/export actions.
 */
export function useOverlayActionHandlers({ model, fileName }: UseOverlayActionHandlersArgs) {
  const { toast, setToast } = useOverlayToast();

  const {
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
    surveyImportOptions,
    setSurveyImportOptions,
    suggestSurveyKeys: suggestSurveyKeysRaw
  } = useOverlaySurveyState(model);

  const {
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

    surveyImportDialogOpen,
    setSurveyImportDialogOpen,
    surveyImporting,
    surveyImportError,

    lastOverlayImport,
    doOverlayImport,
    doOverlayExport,
    doOverlaySurveyExport,
    doOverlaySurveyImport,
    doOverlaySurveyExportNow,
    overlayHasEntries,
    overlayHasIssues,
    overlayReportAvailable,
    liveReport
  } = useOverlayImportFlows({
    model,
    fileName,
    setToast,
    surveyTargetSet,
    surveyElementTypes,
    surveyRelationshipTypes,
    surveyTagKeysText,
    surveyImportOptions
  });

  const suggestSurveyKeys = useCallback(() => {
    const { keys } = suggestSurveyKeysRaw();
    setToast({ kind: 'info', message: keys.length ? `Suggested ${keys.length} keys.` : 'No tag keys found to suggest.' });
  }, [suggestSurveyKeysRaw, setToast]);

  const [overlayReportOpen, setOverlayReportOpen] = useState(false);
  const [overlayManageOpen, setOverlayManageOpen] = useState(false);

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
  }, [model, overlayHasEntries, setToast]);

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

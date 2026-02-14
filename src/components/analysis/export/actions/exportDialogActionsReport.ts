import type { ExportDialogState } from '../useExportDialogState';

import { addToExportReport, clearExportReport, exportReportAsJsonBlob, loadExportReport } from '../../../../export';
import { downloadBlobFile, sanitizeFileNameWithExtension } from '../../../../store/download';

export function createExportDialogReportActions(state: ExportDialogState) {
  const addToReport = () => {
    try {
      addToExportReport({
        kind: state.kind,
        title: state.exportBundle.title || 'export',
        modelName: state.modelName,
        exportOptions: state.exportOptions,
        analysisRequest: state.analysisRequest,
        analysisViewState: state.analysisViewState,
        bundle: state.exportBundle,
      });
      const items = loadExportReport();
      state.setReportCount(items.length);
      state.setStatus(`Added to report (${items.length} item${items.length === 1 ? '' : 's'}).`);
    } catch (e) {
      state.setStatus((e as Error).message || 'Failed to add to report.');
    }
  };

  const downloadReportJson = () => {
    try {
      const items = loadExportReport();
      const blob = exportReportAsJsonBlob(items);
      const fileName = sanitizeFileNameWithExtension('export-report', 'json');
      downloadBlobFile(fileName, blob);
      state.setStatus('Downloaded report.json.');
    } catch (e) {
      state.setStatus((e as Error).message || 'Failed to download report.');
    }
  };

  const clearReport = () => {
    clearExportReport();
    state.setReportCount(0);
    state.setStatus('Cleared report.');
  };

  return { addToReport, downloadReportJson, clearReport };
}

import type { ExportDialogState } from '../useExportDialogState';

import { copyTextToClipboard, tabularToCsv, tabularToTsv } from '../../../../export';
import { downloadBlobFile, sanitizeFileNameWithExtension } from '../../../../store/download';

export function createExportDialogTableActions(state: ExportDialogState) {
  const copyTableTsv = async () => {
    await state.runAction('Copy', async () => {
      const tableArtifact = state.exportBundle.artifacts.find((a) => a.type === 'table');
      if (!tableArtifact || tableArtifact.type !== 'table') {
        const msg = state.exportBundle.warnings?.[0] ?? 'Copy table is not supported for this view yet.';
        throw new Error(msg);
      }
      const tsv = tabularToTsv(tableArtifact.data);
      await copyTextToClipboard(tsv);
      state.setStatus(`Copied ${tableArtifact.name} table as TSV.`);
    });
  };

  const downloadCsv = async () => {
    await state.runAction('Download', async () => {
      const tableArtifact = state.exportBundle.artifacts.find((a) => a.type === 'table');
      if (!tableArtifact || tableArtifact.type !== 'table') {
        const msg = state.exportBundle.warnings?.[0] ?? 'CSV export is not supported for this view yet.';
        throw new Error(msg);
      }
      const csv = tabularToCsv(tableArtifact.data);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const fileName = sanitizeFileNameWithExtension(state.exportBundle.title || 'export', 'csv');
      downloadBlobFile(fileName, blob);
      state.setStatus('Downloaded CSV.');
    });
  };

  return { copyTableTsv, downloadCsv };
}

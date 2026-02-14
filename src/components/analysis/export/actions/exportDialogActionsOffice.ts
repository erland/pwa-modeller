import type { ExportDialogState } from '../useExportDialogState';

import { generatePptxBlobV1, generateXlsxBlobV1 } from '../../../../export';
import { downloadBlobFile, sanitizeFileNameWithExtension } from '../../../../store/download';

export function createExportDialogOfficeActions(state: ExportDialogState) {
  const downloadPptx = async () => {
    await state.runAction('Download', async () => {
      const blob = await generatePptxBlobV1(state.exportBundle, state.exportOptions.pptx);
      const fileName = sanitizeFileNameWithExtension(state.exportBundle.title || 'export', 'pptx');
      downloadBlobFile(fileName, blob);
      state.setStatus('Downloaded PPTX.');
    });
  };

  const downloadXlsx = async () => {
    await state.runAction('Download', async () => {
      const blob = await generateXlsxBlobV1(state.exportBundle, state.exportOptions.xlsx);
      const fileName = sanitizeFileNameWithExtension(state.exportBundle.title || 'export', 'xlsx');
      downloadBlobFile(fileName, blob);
      state.setStatus('Downloaded XLSX.');
    });
  };

  return { downloadPptx, downloadXlsx };
}

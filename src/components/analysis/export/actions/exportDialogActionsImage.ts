import type { ExportDialogState } from '../useExportDialogState';

import { copyPngFromSvgText, copyTextToClipboard, downloadPngFromSvgText } from '../../../../export';
import { downloadBlobFile, sanitizeFileNameWithExtension } from '../../../../store/download';

export function createExportDialogImageActions(state: ExportDialogState) {
  const copySvg = async () => {
    await state.runAction('Copy', async () => {
      if (!state.sandboxSvgText) {
        const msg = state.exportBundle.warnings?.[0] ?? 'Copy SVG is not supported for this view yet.';
        throw new Error(msg);
      }
      await copyTextToClipboard(state.sandboxSvgText);
      state.setStatus('Copied SVG markup to clipboard.');
    });
  };

  const downloadSvg = async () => {
    await state.runAction('Download', async () => {
      if (!state.sandboxSvgText) {
        const msg = state.exportBundle.warnings?.[0] ?? 'Download SVG is not supported for this view yet.';
        throw new Error(msg);
      }
      const blob = new Blob([state.sandboxSvgText], { type: 'image/svg+xml;charset=utf-8' });
      const fileName = sanitizeFileNameWithExtension(state.exportBundle.title || 'export', 'svg');
      downloadBlobFile(fileName, blob);
      state.setStatus('Downloaded SVG.');
    });
  };

  const copyPng = async () => {
    await state.runAction('Copy', async () => {
      if (!state.canCopyImage) {
        throw new Error('Copy image is not supported in this browser.');
      }
      if (!state.sandboxSvgText) {
        const msg = state.exportBundle.warnings?.[0] ?? 'Copy PNG is not supported for this view yet.';
        throw new Error(msg);
      }
      await copyPngFromSvgText(state.sandboxSvgText, { scale: 2, background: '#ffffff' });
      state.setStatus('Copied image as PNG.');
    });
  };

  const downloadPng = async () => {
    await state.runAction('Download', async () => {
      if (!state.sandboxSvgText) {
        const msg = state.exportBundle.warnings?.[0] ?? 'Download PNG is not supported for this view yet.';
        throw new Error(msg);
      }
      await downloadPngFromSvgText(state.exportBundle.title, state.sandboxSvgText, { scale: 2, background: '#ffffff' });
      state.setStatus('Downloaded PNG.');
    });
  };

  return { copySvg, downloadSvg, copyPng, downloadPng };
}

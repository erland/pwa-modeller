import type { AnalysisViewKind } from '../components/analysis/contracts/analysisViewState';
import type { ExportOptions } from './contracts/ExportOptions';
import type { ExportViewState } from './contracts/ExportBundle';

/**
 * Derive what export actions should be enabled for a given analysis kind + options.
 * This is UI-only gating. Actual builders may still throw if required data is missing.
 */
export function deriveExportViewState(kind: AnalysisViewKind, _analysisViewState: unknown, options: ExportOptions): ExportViewState {
  const isClipboard = options.target === 'clipboard';

  const canCopyTable = isClipboard && (kind === 'matrix' || kind === 'portfolio');
  const canCopyImage = isClipboard && kind === 'sandbox';

  const canDownloadPptx = !isClipboard && (kind === 'matrix' || kind === 'portfolio' || kind === 'sandbox');
  const canDownloadXlsx = !isClipboard && (kind === 'matrix' || kind === 'portfolio');

  return {
    canCopyTable,
    canCopyImage,
    canDownloadPptx,
    canDownloadXlsx,
    supportsCharts: false,
  };
}

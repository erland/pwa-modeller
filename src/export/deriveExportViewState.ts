import type { AnalysisViewKind, AnalysisViewState } from '../components/analysis/contracts/analysisViewState';
import type { ExportOptions } from './contracts/ExportOptions';
import type { ExportViewState } from './contracts/ExportBundle';

const usesColorEncoding = (kind: AnalysisViewKind, viewState: AnalysisViewState): boolean => {
  switch (kind) {
    case 'matrix':
      return (viewState.kind === 'matrix' && Boolean(viewState.heatmapEnabled)) || false;
    case 'portfolio':
      return viewState.kind === 'portfolio' && Boolean(viewState.primaryMetricKey);
    default:
      return false;
  }
};

/**
 * Derive export-specific view state from the analysis view state and export options.
 * This applies a small set of safety rules so exporters can depend on a stable shape.
 */
export const deriveExportViewState = (
  kind: AnalysisViewKind,
  viewState: AnalysisViewState,
  exportOptions: ExportOptions,
): ExportViewState => {
  // Defensive: if called with mismatched kind, still behave sensibly.
  const colorEncoding = usesColorEncoding(kind, viewState);

  // PPTX minimal rules
  const pptxTheme = exportOptions.pptx.theme === 'brand' ? 'brand' : 'light';
  const includeLegend = exportOptions.pptx.includeLegend || colorEncoding;

  const fontScale = exportOptions.target === 'pptx' || exportOptions.target === 'both' ? 1.15 : 1.0;

  return {
    target: exportOptions.target,
    pptx: {
      layout: exportOptions.pptx.layout,
      theme: pptxTheme,
      includeLegend,
      includeFilters: exportOptions.pptx.includeFilters,
      includeMethodNote: exportOptions.pptx.includeMethodNote,
      footerText: exportOptions.pptx.footerText,
      fontScale,
    },
    xlsx: {
      includeData: exportOptions.xlsx.includeData,
      includeCharts: exportOptions.xlsx.includeCharts,
      sheetName: exportOptions.xlsx.sheetName,
    },
  };
};

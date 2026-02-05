import type { AnalysisViewKind, AnalysisViewState } from '../components/analysis/contracts/analysisViewState';
import type { ExportOptions, PptxLayoutPreset } from './contracts/ExportOptions';

const defaultLayoutForKind = (kind: AnalysisViewKind): PptxLayoutPreset => {
  switch (kind) {
    case 'matrix':
      return 'table';
    case 'portfolio':
      return 'dashboard';
    case 'sandbox':
      return 'chart';
    case 'traceability':
      return 'chart+bullets';
    case 'paths':
    case 'related':
    default:
      return 'chart+bullets';
  }
};

const defaultSheetNameForKind = (kind: AnalysisViewKind): string => {
  switch (kind) {
    case 'related':
      return 'Related';
    case 'paths':
      return 'Paths';
    case 'traceability':
      return 'Traceability';
    case 'matrix':
      return 'Matrix';
    case 'portfolio':
      return 'Portfolio';
    case 'sandbox':
      return 'Sandbox';
    default:
      return 'Export';
  }
};

const usesColorEncoding = (kind: AnalysisViewKind, viewState: AnalysisViewState): boolean => {
  switch (kind) {
    case 'matrix':
      return viewState.kind === 'matrix' && Boolean(viewState.heatmapEnabled);
    case 'portfolio':
      return viewState.kind === 'portfolio' && Boolean(viewState.primaryMetricKey);
    default:
      return false;
  }
};

/**
 * Derive default export options for a given analysis mode.
 * This does not perform any export; it only establishes stable defaults for later UI.
 */
export const deriveDefaultExportOptions = (kind: AnalysisViewKind, viewState: AnalysisViewState): ExportOptions => {
  const colorEncoding = usesColorEncoding(kind, viewState);

  return {
    // Start with clipboard; later steps will switch depending on which button was pressed.
    target: 'clipboard',
    pptx: {
      layout: defaultLayoutForKind(kind),
      theme: 'light',
      includeLegend: colorEncoding,
      includeFilters: true,
      includeMethodNote: false,
    },
    xlsx: {
      includeData: true,
      includeCharts: false,
      sheetName: defaultSheetNameForKind(kind),
    },
  };
};

import type { AnalysisViewKind } from '../components/analysis/contracts/analysisViewState';
import type { ExportOptions } from './contracts/ExportOptions';

export function deriveDefaultExportOptions(kind: AnalysisViewKind): ExportOptions {
  return {
    target: 'clipboard',
    pptx: {
      layout: 'wide',
      theme: 'light',
      includeTitleSlide: true,
      includeNotes: false,
      footerText: kind ? `EA Modeller — ${kind}` : 'EA Modeller',
    },
    xlsx: {
      includeRawData: true,
      includeSummary: true,
      sheetName: kind ? kind.slice(0, 31) : 'export',
    },
    includeCharts: false,
  };
}

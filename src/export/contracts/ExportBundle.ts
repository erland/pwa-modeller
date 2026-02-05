import type { AnalysisRequest } from '../../domain/analysis/analysisRequest';
import type { AnalysisViewState } from '../../components/analysis/contracts/analysisViewState';
import type { ExportOptions, PptxLayoutPreset, PptxTheme } from './ExportOptions';

export type TabularColumnType = 'string' | 'number' | 'boolean' | 'date' | 'json';

export type TabularColumn = {
  key: string;
  label: string;
  type?: TabularColumnType;
};

export type TabularData = {
  columns: TabularColumn[];
  rows: Record<string, unknown>[];
};

export type ChartSpec = {
  type: 'bar' | 'column' | 'line' | 'scatter' | 'heatmap';
  categoryKey?: string;
  xKey?: string;
  yKey?: string;
  seriesKey?: string;
  valueKey?: string;
  title?: string;
  xLabel?: string;
  yLabel?: string;
  numberFormat?: string;
};

export type ImageRef = {
  mime: 'image/png' | 'image/svg+xml';
  dataUrl: string;
  width: number;
  height: number;
};

/**
 * Normalized, export-only view state derived from AnalysisViewState + ExportOptions.
 * This prevents exporting logic from depending on mode-specific UI toggles directly.
 */
export type ExportViewState = {
  /** Target the user is currently exporting for (may still include both artifacts later). */
  target: ExportOptions['target'];

  /** PPTX-rendering oriented options. */
  pptx: {
    layout: PptxLayoutPreset;
    theme: PptxTheme;
    includeLegend: boolean;
    includeFilters: boolean;
    includeMethodNote: boolean;
    footerText?: string;
    /** Slight scaling to improve readability on slides. */
    fontScale: number;
  };

  /** XLSX-export oriented options. */
  xlsx: {
    includeData: boolean;
    includeCharts: boolean;
    sheetName?: string;
  };
};

export type ExportArtifact =
  | {
      kind: 'table';
      title?: string;
      data: TabularData;
    }
  | {
      kind: 'chart';
      title?: string;
      spec: ChartSpec;
      data: TabularData;
    }
  | {
      kind: 'image';
      title?: string;
      image: ImageRef;
    }
  | {
      kind: 'text';
      title?: string;
      text: string;
    };

export type ExportBundle = {
  title: string;
  subtitle?: string;

  /**
   * A stable identifier for the current model+overlay state (if applicable).
   * Computation is left to later steps; for now it can be any deterministic string.
   */
  modelFingerprint: string;

  /** Canonical engine request. */
  request: AnalysisRequest;

  /** Canonical UI-only view state for the analysis mode. */
  viewState: AnalysisViewState;

  /** Export-specific derived view state. */
  exportViewState: ExportViewState;

  /** Normalized artifacts (tables/charts/images/text) that exporters can consume. */
  artifacts: ExportArtifact[];
};

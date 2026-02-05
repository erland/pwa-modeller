export type TabularData = {
  /** Header row (column labels). */
  headers: string[];
  /** Data rows (each row length should match headers length). */
  rows: Array<Array<string | number | null | undefined>>;
};

export type ImageRef = {
  kind: 'png' | 'svg';
  /** Data URL (data:image/png;base64,…) or SVG markup for kind === 'svg'. */
  data: string;
  width?: number;
  height?: number;
};

export type ChartSpec = {
  kind: 'bar' | 'line' | 'scatter' | 'heatmap';
  title?: string;
  // v2 placeholder
};

export type ExportArtifact =
  | { type: 'table'; name: string; data: TabularData }
  | { type: 'image'; name: string; data: ImageRef }
  | { type: 'chart'; name: string; data: ChartSpec };

export type ExportBundle = {
  /** Human-friendly title for the export set. */
  title: string;
  /** Artifacts included in the export (tables/images). */
  artifacts: ExportArtifact[];
  /** Diagnostics for UI display (optional). */
  warnings?: string[];
};

export type ExportViewState = {
  canCopyTable: boolean;
  canCopyImage: boolean;
  canDownloadPptx: boolean;
  canDownloadXlsx: boolean;
  // v2 placeholders
  supportsCharts: boolean;
};

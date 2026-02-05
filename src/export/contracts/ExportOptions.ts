export type ExportTarget = 'pptx' | 'xlsx' | 'both' | 'clipboard';

export type PptxLayoutPreset = 'chart' | 'chart+bullets' | 'table' | 'dashboard';
export type PptxTheme = 'light' | 'brand';

export type PptxOptions = {
  layout: PptxLayoutPreset;
  theme: PptxTheme;
  includeLegend: boolean;
  includeFilters: boolean;
  includeMethodNote: boolean;
  footerText?: string;
};

export type XlsxOptions = {
  /** Include raw/normalized data tables. */
  includeData: boolean;
  /** Keep false in v1; reserved for later chart export. */
  includeCharts: boolean;
  /** Optional sheet name override. */
  sheetName?: string;
};

export type ExportOptions = {
  target: ExportTarget;
  pptx: PptxOptions;
  xlsx: XlsxOptions;
};

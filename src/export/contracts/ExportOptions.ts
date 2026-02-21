export type ExportTarget = 'clipboard' | 'download';

export type PptxOptions = {
  layout: 'wide' | 'standard';
  theme: 'light' | 'dark';
  includeTitleSlide: boolean;
  includeNotes: boolean;
  footerText?: string;
  /** How to render diagrams: as a rasterized image (default) or editable shapes/connectors. */
  diagramMode?: 'image' | 'shapes';
};

export type XlsxOptions = {
  includeRawData: boolean;
  includeSummary: boolean;
  sheetName?: string;
};

export type ExportOptions = {
  target: ExportTarget;
  pptx: PptxOptions;
  xlsx: XlsxOptions;
  // v2+: include charts etc.
  includeCharts?: boolean;
};

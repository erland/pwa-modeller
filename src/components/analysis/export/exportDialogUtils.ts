import type { AnalysisViewKind } from '../contracts/analysisViewState';
import type { ExportArtifact } from '../../../export';

export type ExportFormat = 'svg' | 'png' | 'pptx' | 'xlsx' | 'tsv' | 'csv';

/**
 * Determines which export formats are relevant per analysis view kind.
 *
 * Keep this function pure and side-effect free; it is used to drive UI state.
 */
export function getAvailableFormats(kind: AnalysisViewKind): ExportFormat[] {
  if (kind === 'sandbox') return ['svg', 'png', 'pptx', 'xlsx'];
  if (kind === 'matrix') return ['xlsx', 'tsv'];
  if (kind === 'portfolio') return ['csv', 'xlsx'];
  if (kind === 'related' || kind === 'paths') return ['svg', 'png', 'csv', 'xlsx'];
  if (kind === 'traceability') return ['svg', 'png'];
  return ['svg'];
}

export function formatLabel(f: ExportFormat): string {
  switch (f) {
    case 'svg':
      return 'SVG';
    case 'png':
      return 'PNG';
    case 'pptx':
      return 'PPTX';
    case 'xlsx':
      return 'XLSX';
    case 'tsv':
      return 'TSV (table)';
    case 'csv':
      return 'CSV';
  }
}

export function findSandboxSvgText(artifacts: ExportArtifact[]): string | null {
  // Prefer the first *SVG* image artifact (there may also be a PNG preview present).
  const svgArtifact = artifacts.find(
    (a): a is Extract<ExportArtifact, { type: 'image' }> => a.type === 'image' && a.data.kind === 'svg',
  );
  return svgArtifact?.data.data ?? null;
}

export type ExportCapabilities = {
  canSvg: boolean;
  canPng: boolean;
  canPptx: boolean;
  hasTable: boolean;
  canXlsx: boolean;
  canTsv: boolean;
  canCsv: boolean;
};

/**
 * Computes what actions should be enabled for the dialog.
 * Keep this pure to avoid subtle UI state bugs.
 */
export function getExportCapabilities(args: {
  kind: AnalysisViewKind;
  sandboxSvgText: string | null;
  artifacts: ExportArtifact[];
}): ExportCapabilities {
  const { kind, sandboxSvgText, artifacts } = args;
  const hasTable = artifacts.some((a) => a.type === 'table');
  const canSvg = !!sandboxSvgText;
  const canPng = !!sandboxSvgText;
  const canPptx = kind === 'sandbox';
  const canXlsx = kind === 'sandbox' || hasTable;
  const canTsv = (kind === 'matrix' || kind === 'portfolio') && hasTable;
  const canCsv = hasTable;
  return { canSvg, canPng, canPptx, hasTable, canXlsx, canTsv, canCsv };
}

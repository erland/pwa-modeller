import type { AnalysisRequest } from '../../domain/analysis';
import type { RelationshipMatrixResult } from '../../domain/analysis/relationshipMatrix';
import type { AnalysisViewKind, AnalysisViewState } from '../../components/analysis/contracts/analysisViewState';

import type { ExportBundle, ExportArtifact, ImageRef, TabularData } from '../contracts/ExportBundle';
import type { ExportOptions } from '../contracts/ExportOptions';

import { buildMatrixTabular } from './matrixToTabular';

type MatrixContext = {
  result: RelationshipMatrixResult | null;
  /** Optional computed cell values if the UI is showing a metric instead of raw counts. */
  cellValues?: number[][];
};

export type BuildExportBundleContext = {
  kind: AnalysisViewKind;
  modelName: string;
  analysisRequest: AnalysisRequest;
  analysisViewState: AnalysisViewState;
  exportOptions: ExportOptions;

  /** Optional computed data already available in the UI. */
  matrix?: MatrixContext;

  /** DOM access is optional; used for "fast win" extraction in early steps. */
  document?: Document;
};

function extractHtmlTableAsTabular(table: HTMLTableElement): TabularData {
  const headers = Array.from(table.querySelectorAll('thead th')).map((th) => (th.textContent ?? '').trim());
  const rows = Array.from(table.querySelectorAll('tbody tr')).map((tr) =>
    Array.from(tr.querySelectorAll('td,th')).map((td) => (td.textContent ?? '').trim())
  );
  return { headers, rows };
}

function sandboxSvgToImageRef(svg: SVGSVGElement): ImageRef {
  // Outer HTML is good enough as a v1 normalized representation.
  const data = svg.outerHTML;
  // width/height can be missing; callers can interpret viewBox later.
  const width = svg.width?.baseVal?.value || undefined;
  const height = svg.height?.baseVal?.value || undefined;
  return { kind: 'svg', data, width, height };
}

export function buildExportBundle(ctx: BuildExportBundleContext): ExportBundle {
  const { kind, modelName } = ctx;
  const title = `${modelName} — ${kind}`;

  const artifacts: ExportArtifact[] = [];
  const warnings: string[] = [];

  if (kind === 'matrix') {
    const r = ctx.matrix?.result;
    if (!r) {
      warnings.push('Matrix results are not available yet.');
    } else {
      const table = buildMatrixTabular(r, ctx.matrix?.cellValues);
      artifacts.push({ type: 'table', name: 'Matrix', data: table });
    }
  }

  if (kind === 'portfolio') {
    const doc = ctx.document;
    if (!doc) {
      warnings.push('Portfolio export requires DOM access in v1.');
    } else {
      const table = doc.querySelector('table[aria-label="Portfolio population table"]') as HTMLTableElement | null;
      if (!table) {
        warnings.push('Could not find the Portfolio table in the page.');
      } else {
        artifacts.push({ type: 'table', name: 'Portfolio', data: extractHtmlTableAsTabular(table) });
      }
    }
  }

  if (kind === 'sandbox') {
    const doc = ctx.document;
    if (!doc) {
      warnings.push('Sandbox image export requires DOM access in v1.');
    } else {
      const svg = doc.querySelector('.analysisSandboxSvg') as SVGSVGElement | null;
      if (!svg) {
        warnings.push('Could not find the Sandbox canvas SVG in the page.');
      } else {
        artifacts.push({ type: 'image', name: 'Sandbox canvas', data: sandboxSvgToImageRef(svg) });
      }
    }
  }

  // Other views will be added as we grow export coverage.
  if (kind !== 'matrix' && kind !== 'portfolio' && kind !== 'sandbox') {
    warnings.push('Export bundle is not yet implemented for this view.');
  }

  return { title, artifacts, warnings: warnings.length ? warnings : undefined };
}

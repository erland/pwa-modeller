import type { AnalysisRequest } from '../../domain/analysis';
import type { RelationshipMatrixResult } from '../../domain/analysis/relationshipMatrix';
import type { PathsBetweenResult, RelatedElementsResult } from '../../domain';
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

  /** Optional prebuilt tabular export for Portfolio (includes elementId etc.). */
  portfolioTable?: TabularData | null;

  /** Optional analysis results for Related/Paths exports (matching existing CSV exports). */
  relatedResult?: RelatedElementsResult | null;
  pathsResult?: PathsBetweenResult | null;

  /** Optional formatter helpers for turning ids into user-friendly labels. */
  formatters?: {
    nodeLabel: (id: string) => string;
    nodeType: (id: string) => string;
    nodeLayer: (id: string) => string;
  };

  /** DOM access is optional; used for extracting SVGs for image exports. */
  document?: Document;
};

function sandboxSvgToImageRef(svg: SVGSVGElement): ImageRef {
  // The sandbox SVG is styled via CSS classes. If we serialize only outerHTML we lose
  // computed styles, and downstream rasterization (PNG/PPTX) can render shapes black.
  // To preserve appearance we clone and inline a small set of computed style properties.
  const data = inlineComputedSvgStyles(svg);
  // width/height can be missing; callers can interpret viewBox later.
  const width = svg.width?.baseVal?.value || undefined;
  const height = svg.height?.baseVal?.value || undefined;
  return { kind: 'svg', data, width, height };
}

function inlineComputedSvgStyles(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;

  // Ensure namespaces exist for better compatibility.
  if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  if (!clone.getAttribute('xmlns:xlink')) clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

  const srcEls = Array.from(svg.querySelectorAll('*'));
  const dstEls = Array.from(clone.querySelectorAll('*'));
  const n = Math.min(srcEls.length, dstEls.length);

  for (let i = 0; i < n; i += 1) {
    const src = srcEls[i] as Element;
    const dst = dstEls[i] as Element;
    const cs = window.getComputedStyle(src);

    // The subset below covers the vast majority of our diagram styling.
    const style: string[] = [];

    // Fills/strokes
    if (cs.fill && cs.fill !== 'none') style.push(`fill:${cs.fill}`);
    if (cs.stroke && cs.stroke !== 'none') style.push(`stroke:${cs.stroke}`);
    if (cs.strokeWidth && cs.strokeWidth !== '0px') style.push(`stroke-width:${cs.strokeWidth}`);
    if (cs.strokeDasharray && cs.strokeDasharray !== 'none') style.push(`stroke-dasharray:${cs.strokeDasharray}`);
    if (cs.strokeLinecap && cs.strokeLinecap !== 'butt') style.push(`stroke-linecap:${cs.strokeLinecap}`);
    if (cs.strokeLinejoin && cs.strokeLinejoin !== 'miter') style.push(`stroke-linejoin:${cs.strokeLinejoin}`);

    // Text
    if (cs.color) style.push(`color:${cs.color}`);
    if (cs.fontFamily) style.push(`font-family:${cs.fontFamily}`);
    if (cs.fontSize) style.push(`font-size:${cs.fontSize}`);
    if (cs.fontWeight) style.push(`font-weight:${cs.fontWeight}`);
    if (cs.fontStyle && cs.fontStyle !== 'normal') style.push(`font-style:${cs.fontStyle}`);
    if (cs.textDecorationLine && cs.textDecorationLine !== 'none') style.push(`text-decoration:${cs.textDecorationLine}`);

    // Opacity
    if (cs.opacity && cs.opacity !== '1') style.push(`opacity:${cs.opacity}`);

    if (style.length) {
      // Preserve any explicit inline styles and append computed style overrides.
      const existing = dst.getAttribute('style');
      const merged = existing ? `${existing};${style.join(';')}` : style.join(';');
      dst.setAttribute('style', merged);
    }
  }

  // XMLSerializer handles SVG reasonably well for our use case.
  const s = new XMLSerializer().serializeToString(clone);
  return s;
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
    if (ctx.portfolioTable) {
      artifacts.push({ type: 'table', name: 'Portfolio', data: ctx.portfolioTable });
    } else {
      warnings.push('Portfolio export table is not available yet.');
    }
  }

  if (kind === 'related') {
    const hits = ctx.relatedResult?.hits ?? [];
    const fmt = ctx.formatters;
    if (!fmt) {
      warnings.push('Related-elements export requires formatters in v1.');
    } else if (hits.length === 0) {
      warnings.push('No related-elements results are available yet.');
    } else {
      const table: TabularData = {
        headers: ['distance', 'elementId', 'name', 'type', 'layer'],
        rows: hits.map((h) => [String(h.distance ?? ''), h.elementId, fmt.nodeLabel(h.elementId), fmt.nodeType(h.elementId), fmt.nodeLayer(h.elementId)]),
      };
      artifacts.push({ type: 'table', name: 'Related elements', data: table });
    }

    const doc = ctx.document;
    if (doc) {
      const svg = doc.querySelector('svg[aria-label="Mini graph (related elements)"]') as SVGSVGElement | null;
      if (svg) artifacts.push({ type: 'image', name: 'Related mini graph', data: sandboxSvgToImageRef(svg) });
    }
  }

  if (kind === 'paths') {
    const paths = ctx.pathsResult?.paths ?? [];
    const fmt = ctx.formatters;
    if (!fmt) {
      warnings.push('Paths export requires formatters in v1.');
    } else if (paths.length === 0) {
      warnings.push('No connection paths results are available yet.');
    } else {
      const rows: string[][] = [];
      for (let pi = 0; pi < paths.length; pi++) {
        const p = paths[pi];
        for (let hi = 0; hi < p.steps.length; hi++) {
          const s = p.steps[hi];
          rows.push([
            String(pi + 1),
            String(hi + 1),
            s.fromId,
            fmt.nodeLabel(s.fromId),
            s.relationshipId,
            s.relationshipType,
            s.toId,
            fmt.nodeLabel(s.toId),
          ]);
        }
      }
      const table: TabularData = {
        headers: ['pathIndex', 'hopIndex', 'fromId', 'fromName', 'relationshipId', 'relationshipType', 'toId', 'toName'],
        rows,
      };
      artifacts.push({ type: 'table', name: 'Connection paths (flattened)', data: table });
    }

    const doc = ctx.document;
    if (doc) {
      const svg = doc.querySelector('svg[aria-label="Mini graph (connection paths)"]') as SVGSVGElement | null;
      if (svg) artifacts.push({ type: 'image', name: 'Paths mini graph', data: sandboxSvgToImageRef(svg) });
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

  if (kind === 'traceability') {
    const doc = ctx.document;
    if (doc) {
      const svg = doc.querySelector('svg[aria-label="Traceability mini graph"]') as SVGSVGElement | null;
      if (svg) artifacts.push({ type: 'image', name: 'Traceability mini graph', data: sandboxSvgToImageRef(svg) });
      else warnings.push('Could not find the Traceability mini graph SVG.');
    } else {
      warnings.push('Traceability image export requires DOM access in v1.');
    }
  }

  // Other views will be added as we grow export coverage.
  if (kind !== 'matrix' && kind !== 'portfolio' && kind !== 'sandbox' && kind !== 'related' && kind !== 'paths' && kind !== 'traceability') {
    warnings.push('Export bundle is not yet implemented for this view.');
  }

  return { title, artifacts, warnings: warnings.length ? warnings : undefined };
}

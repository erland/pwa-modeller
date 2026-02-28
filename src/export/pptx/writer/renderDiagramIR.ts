import type PptxGenJS from 'pptxgenjs';
import type { Slide, TextRun } from 'pptxgenjs';

import type { PptxDiagramIR, PptxNodeIR, PptxTextRun } from '../ir/types';
import { renderConnectorEdgePlaceholder, renderPolylineEdgePlaceholder } from './renderEdge';

export type PptxWriterEnv = {
  /** slide size in inches */
  pageW: number;
  pageH: number;
};

function normalizeHex(color: string | undefined): string | undefined {
  if (!color) return undefined;
  const c = String(color).trim();
  if (!c) return undefined;
  return c.startsWith('#') ? c.slice(1) : c;
}

function toPptxRuns(runs: PptxTextRun[] | undefined, fallbackText: string | undefined): Array<TextRun> | string {
  if (!runs || runs.length === 0) return fallbackText ?? '';
  const out: TextRun[] = [];
  for (const r of runs) {
    out.push({
      text: r.text,
      options: {
        bold: r.bold,
        italic: r.italic,
        fontSize: r.fontSize,
        color: normalizeHex(r.color),
        fontFace: r.fontFace,
      },
    });
  }
  return out;
}

function renderNode(slide: Slide, node: PptxNodeIR): void {
  const shape = (node.shape ?? 'roundRect') as any; // pptxgenjs allows string shape names.
  const content = toPptxRuns(node.textRuns, node.text);

  slide.addText(content as any, {
    altText: node.id ? `EA_NODE:${node.id}` : undefined,
    shape,
    x: node.x,
    y: node.y,
    w: node.w,
    h: node.h,
    fill: node.fill ? { color: normalizeHex(node.fill) } : undefined,
    line: node.stroke
      ? {
          color: normalizeHex(node.stroke),
          width: typeof node.strokeWidth === 'number' ? node.strokeWidth : undefined,
        }
      : undefined,
    fontFace: 'Calibri',
    fontSize: 10,
    color: normalizeHex(node.textColor) ?? '111111',
    valign: 'mid',
    align: 'center',
    margin: 4,
  });
}

/**
 * Render a diagram IR into a PPTX slide.
 *
 * Current connector strategy:
 * - For `edge.kind === "connector"`: render a placeholder line shape with a canonical marker in altText.
 * - For `edge.kind === "polyline"`: render a placeholder straight line between the first and last path points.
 *
 * A later step can upgrade connector edges to true shape-attached connectors at the OOXML layer.
 */
export function renderPptxDiagramIR(slide: Slide, diagram: PptxDiagramIR): void {
  const nodeById = new Map<string, PptxNodeIR>();
  for (const n of diagram.nodes) nodeById.set(n.id, n);

  // Draw edges first (behind nodes).
  for (const e of diagram.edges) {
    if (e.kind === 'polyline') {
      renderPolylineEdgePlaceholder(slide, e, nodeById);
    } else {
      renderConnectorEdgePlaceholder(slide, e, nodeById);
    }
  }

  for (const n of diagram.nodes) {
    renderNode(slide, n);
  }
}

// Re-export PptxGenJS type to avoid unused import lint noise in some environments.
export type { PptxGenJS };

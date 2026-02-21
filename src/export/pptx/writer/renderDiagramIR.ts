import type PptxGenJS from 'pptxgenjs';
import type { Slide, TextRun } from 'pptxgenjs';

import type { PptxDiagramIR, PptxEdgeIR, PptxNodeIR, PptxTextRun } from '../ir/types';

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
    altText: `EA_IR_NODE:${node.id}`,
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

function renderEdgeAsLine(slide: Slide, edge: PptxEdgeIR, nodeById: Map<string, PptxNodeIR>): void {
  // Fallback renderer (works for both connector & polyline kinds) when we don't yet
  // have a shape-ref based connector writer. Draw as a simple line shape.
  const from = nodeById.get(edge.fromId);
  const to = nodeById.get(edge.toId);

  // Determine endpoints.
  let x1: number | undefined;
  let y1: number | undefined;
  let x2: number | undefined;
  let y2: number | undefined;

  if (edge.path && edge.path.length >= 2) {
    x1 = edge.path[0].x;
    y1 = edge.path[0].y;
    x2 = edge.path[edge.path.length - 1].x;
    y2 = edge.path[edge.path.length - 1].y;
  } else if (from && to) {
    x1 = from.x + from.w / 2;
    y1 = from.y + from.h / 2;
    x2 = to.x + to.w / 2;
    y2 = to.y + to.h / 2;
  }

  if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) return;

  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const w = Math.max(0.01, Math.abs(x2 - x1));
  const h = Math.max(0.01, Math.abs(y2 - y1));

  slide.addShape('line' as any, {
    x,
    y,
    w,
    h,
    altText: `EA_IR_EDGE:${edge.id}|${edge.fromId}->${edge.toId}`,
    line: {
      color: normalizeHex(edge.stroke) ?? '333333',
      width: typeof edge.strokeWidth === 'number' ? edge.strokeWidth : 1,
      dash: edge.dashed ? 'dash' : 'solid',
    },
  });

  if (edge.label) {
    // Place label at midpoint (best-effort).
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    slide.addText(edge.label, {
      x: mx - 1,
      y: my - 0.2,
      w: 2,
      h: 0.4,
      fontSize: 10,
      color: '111111',
      align: 'center',
      valign: 'mid',
      // Keep props conservative for pptxgenjs type compatibility.
      fill: { color: 'FFFFFF' },
      line: { color: 'FFFFFF', width: 0 },
    });
  }
}

/**
 * Render a diagram IR into a PPTX slide.
 *
 * NOTE: Step 2 implementation is intentionally conservative:
 * - Nodes are rendered as text shapes.
 * - Edges are rendered as simple line shapes (even for kind='connector')
 *   so the writer can be introduced without changing behavior elsewhere.
 *
 * Step 3+ will upgrade connector edges to real PPTX connectors and keep them attached.
 */
export function renderPptxDiagramIR(slide: Slide, diagram: PptxDiagramIR, _env: PptxWriterEnv): void {
  const nodeById = new Map<string, PptxNodeIR>();
  for (const n of diagram.nodes) nodeById.set(n.id, n);

  // Draw edges first (behind nodes).
  for (const e of diagram.edges) {
    renderEdgeAsLine(slide, e, nodeById);
  }

  for (const n of diagram.nodes) {
    renderNode(slide, n);
  }
}

// Re-export PptxGenJS type to avoid unused import lint noise in some environments.
export type { PptxGenJS };

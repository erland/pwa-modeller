import type { Slide } from 'pptxgenjs';

import type { PptxEdgeIR, PptxNodeIR } from '../ir/types';
import { encodeEdgeMarker } from './edgeMarker';

function normalizeHex(color: string | undefined): string | undefined {
  if (!color) return undefined;
  const c = String(color).trim();
  if (!c) return undefined;
  return c.startsWith('#') ? c.slice(1) : c;
}

function dashForPattern(pattern: 'solid' | 'dashed' | 'dotted'): 'solid' | 'dash' | 'dot' {
  return pattern === 'dashed' ? 'dash' : pattern === 'dotted' ? 'dot' : 'solid';
}

function computeEndpoints(edge: PptxEdgeIR, nodeById: Map<string, PptxNodeIR>): { x1: number; y1: number; x2: number; y2: number } | null {
  if (edge.path && edge.path.length >= 2) {
    const a = edge.path[0];
    const b = edge.path[edge.path.length - 1];
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  }
  const from = nodeById.get(edge.fromId);
  const to = nodeById.get(edge.toId);
  if (!from || !to) return null;
  return {
    x1: from.x + from.w / 2,
    y1: from.y + from.h / 2,
    x2: to.x + to.w / 2,
    y2: to.y + to.h / 2,
  };
}

/**
 * Canonical renderer for connector edges.
 *
 * Today we still draw a placeholder line-shape (p:sp prstGeom line) with a stable marker in altText.
 * The PPTX post-processor will replace these placeholders with real connectors (p:cxnSp) attached to nodes.
 *
 * Keeping this canonical function prevents marker drift and ensures consistent fallback behavior.
 */
export function renderConnectorEdgePlaceholder(slide: Slide, edge: PptxEdgeIR, nodeById: Map<string, PptxNodeIR>): void {
  const ep = computeEndpoints(edge, nodeById);
  if (!ep) return;

  const { x1, y1, x2, y2 } = ep;
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const w = Math.max(0.01, Math.abs(x2 - x1));
  const h = Math.max(0.01, Math.abs(y2 - y1));

  const marker = encodeEdgeMarker(edge);
  const dash = dashForPattern(marker.pattern);

  slide.addShape('line' as any, {
    x,
    y,
    w,
    h,
    altText: marker.altText,
    line: {
      color: normalizeHex(edge.stroke) ?? '333333',
      width: typeof edge.strokeWidth === 'number' ? edge.strokeWidth : 1,
      dash,
      // Fallback arrow: if post-process fails, at least show an arrow when requested.
      endArrowType: marker.tail !== 'none' ? 'arrow' : undefined,
      beginArrowType: marker.head !== 'none' ? 'arrow' : undefined,
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
      fill: { color: 'FFFFFF' },
      line: { color: 'FFFFFF', width: 0 },
    });
  }
}

/**
 * Polyline edges are currently rendered as a straight placeholder between first and last path points.
 * This keeps behavior deterministic and compatible with post-processing.
 */
export function renderPolylineEdgePlaceholder(slide: Slide, edge: PptxEdgeIR, nodeById: Map<string, PptxNodeIR>): void {
  renderConnectorEdgePlaceholder(slide, edge, nodeById);
}

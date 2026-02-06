import type { ExportArtifact, ExportBundle, ImageRef } from '../contracts/ExportBundle';
import type { PptxOptions } from '../contracts/ExportOptions';

import { svgTextToPngBytes } from './svgToPngBytes';
import PptxGenJS from 'pptxgenjs';

function isImageArtifact(a: ExportArtifact): a is { type: 'image'; name: string; data: ImageRef } {
  return a.type === 'image';
}

function pickImageArtifacts(bundle: ExportBundle): Array<{ type: 'image'; name: string; data: ImageRef }> {
  return bundle.artifacts.filter(isImageArtifact);
}

function bytesToBase64(bytes: Uint8Array): string {
  // Avoid call-stack issues for large arrays.
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function layoutToPptxGen(layout: PptxOptions['layout']): string {
  return layout === 'standard' ? 'LAYOUT_4X3' : 'LAYOUT_WIDE';
}

function rgbToHex(rgb: string): string | null {
  // Accept: rgb(r,g,b) or rgba(r,g,b,a)
  const m = rgb
    .replace(/\s+/g, '')
    .match(/^rgba?\((\d+),(\d+),(\d+)(?:,([01](?:\.\d+)?))?\)$/i);
  if (!m) return null;
  const r = Math.max(0, Math.min(255, parseInt(m[1], 10)));
  const g = Math.max(0, Math.min(255, parseInt(m[2], 10)));
  const b = Math.max(0, Math.min(255, parseInt(m[3], 10)));
  const to2 = (n: number) => n.toString(16).padStart(2, '0');
  return `${to2(r)}${to2(g)}${to2(b)}`.toUpperCase();
}

function normalizePptxColor(color: string | null | undefined, fallback: string): string {
  if (!color) return fallback;
  const c = color.trim();
  if (!c) return fallback;
  if (/^#?[0-9a-f]{6}$/i.test(c)) return c.replace('#', '').toUpperCase();
  const h = rgbToHex(c);
  if (h) return h;
  // Some computed styles can return like "rgba(0, 0, 0, 0.65)" or named colors; default fallback.
  return fallback;
}

function parseTranslate(transform: string | null): { x: number; y: number } {
  if (!transform) return { x: 0, y: 0 };
  const m = transform.match(/translate\(\s*([-\d.]+)[ ,]\s*([-\d.]+)\s*\)/);
  if (!m) return { x: 0, y: 0 };
  return { x: parseFloat(m[1]) || 0, y: parseFloat(m[2]) || 0 };
}

function parseViewBox(vb: string | null): { minX: number; minY: number; w: number; h: number } | null {
  if (!vb) return null;
  const parts = vb
    .trim()
    .split(/[\s,]+/)
    .map((s) => parseFloat(s));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
  return { minX: parts[0], minY: parts[1], w: parts[2], h: parts[3] };
}

type SandboxNodeShape = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rx?: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  title: string;
  meta: string;
  titleColor: string;
  metaColor: string;
};

type SandboxEdgeShape = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
  dash?: string;
};

function extractSandboxFromSvgText(svgText: string): { nodes: SandboxNodeShape[]; edges: SandboxEdgeShape[]; vb: { minX: number; minY: number; w: number; h: number } } | null {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg) return null;

  const vb = parseViewBox(svg.getAttribute('viewBox')) ?? { minX: 0, minY: 0, w: 1000, h: 750 };

  const nodeGs = Array.from(doc.querySelectorAll('g.analysisSandboxNode'));
  if (nodeGs.length === 0) return null;

  const nodes: SandboxNodeShape[] = nodeGs.map((g) => {
    const { x, y } = parseTranslate(g.getAttribute('transform'));
    const rect = g.querySelector('rect');
    const w = rect ? parseFloat(rect.getAttribute('width') || '0') || 0 : 0;
    const h = rect ? parseFloat(rect.getAttribute('height') || '0') || 0 : 0;
    const rx = rect ? parseFloat(rect.getAttribute('rx') || '') || undefined : undefined;

    // InlineComputedSvgStyles puts computed styles into style="…"; prefer rect.style.fill.
    const fill = normalizePptxColor((rect as any)?.style?.fill || rect?.getAttribute('fill') || rect?.getAttribute('style') || null, 'FFFFFF');
    const stroke = normalizePptxColor((rect as any)?.style?.stroke || rect?.getAttribute('stroke') || null, '333333');
    const strokeWidthRaw = (rect as any)?.style?.strokeWidth || '';
    const strokeWidth = strokeWidthRaw ? parseFloat(strokeWidthRaw) || 1 : 1;

    const texts = Array.from(g.querySelectorAll('text'));
    const title = (texts[0]?.textContent ?? '').trim();
    const meta = (texts[1]?.textContent ?? '').trim();

    const titleColor = normalizePptxColor((texts[0] as any)?.style?.fill || (texts[0] as any)?.style?.color || null, '111111');
    const metaColor = normalizePptxColor((texts[1] as any)?.style?.fill || (texts[1] as any)?.style?.color || null, '333333');

    // Use elementId from React key if present; otherwise generate.
    const id = (g.getAttribute('data-element-id') || g.getAttribute('id') || title || `node_${Math.random().toString(36).slice(2)}`).slice(0, 64);

    return { id, x, y, w, h, rx, fill, stroke, strokeWidth, title, meta, titleColor, metaColor };
  });

  // Edges: use diagramRelLine paths.
  const edgePaths = Array.from(doc.querySelectorAll('path.diagramRelLine'));
  const edges: SandboxEdgeShape[] = edgePaths
    .map((p) => {
      const d = p.getAttribute('d') || '';
      // Extract first M and last coordinate in the path.
      const coords = Array.from(d.matchAll(/([ML])\s*([-\d.]+)\s+([-\d.]+)/g)).map((m) => ({
        cmd: m[1],
        x: parseFloat(m[2]),
        y: parseFloat(m[3]),
      }));
      if (coords.length < 2) return null;
      const first = coords[0];
      const last = coords[coords.length - 1];

      // Try computed inline style first.
      const stroke = normalizePptxColor((p as any)?.style?.stroke || p.getAttribute('stroke') || null, '333333');
      const swRaw = (p as any)?.style?.strokeWidth || '';
      const strokeWidth = swRaw ? parseFloat(swRaw) || 1 : 1;
      const dash = (p as any)?.style?.strokeDasharray || p.getAttribute('stroke-dasharray') || undefined;

      return { x1: first.x, y1: first.y, x2: last.x, y2: last.y, stroke, strokeWidth, dash: dash || undefined };
    })
    .filter(Boolean) as SandboxEdgeShape[];

  // If viewBox seems bogus, derive bounds from nodes.
  if (vb.w <= 0 || vb.h <= 0) {
    const maxX = Math.max(...nodes.map((n) => n.x + n.w), ...edges.map((e) => Math.max(e.x1, e.x2)), 1000);
    const maxY = Math.max(...nodes.map((n) => n.y + n.h), ...edges.map((e) => Math.max(e.y1, e.y2)), 750);
    return { nodes, edges, vb: { minX: 0, minY: 0, w: maxX, h: maxY } };
  }

  return { nodes, edges, vb };
}

function dashToPptx(dash: string | undefined): 'solid' | 'dash' | 'dot' | 'dashDot' | undefined {
  if (!dash) return undefined;
  const d = dash.trim();
  if (!d || d === 'none') return undefined;
  // Very rough mapping: lots of small values -> dot, otherwise dash.
  const parts = d.split(/[\s,]+/).map((s) => parseFloat(s)).filter((n) => !Number.isNaN(n));
  if (parts.length >= 2) {
    const a = parts[0];
    const b = parts[1];
    if (a <= 2 && b >= 4) return 'dot';
    if (a >= 6 && b >= 4) return 'dash';
  }
  return 'dash';
}

/**
 * PPTX generation v2 (editable shapes + straight lines), implemented using PptxGenJS.
 *
 * For Sandbox exports we parse the inlined-style SVG markup and convert:
 * - Nodes -> PowerPoint rounded rectangles + text (editable)
 * - Edges -> PowerPoint straight lines (editable)
 *
 * Other image artifacts fall back to the image-based slide.
 */
export async function generatePptxBlobV1(bundle: ExportBundle, options: PptxOptions): Promise<Blob> {
  const pptx = new (PptxGenJS as any)();
  pptx.layout = layoutToPptxGen(options.layout);
  pptx.author = 'EA Modeller PWA';
  pptx.company = 'EA Modeller PWA';
  pptx.subject = bundle.title;
  pptx.title = bundle.title;

  // PptxGenJS uses inches for coordinates.
  const pageW = options.layout === 'standard' ? 10 : 13.333;
  const pageH = 7.5;
  const margin = 0.3;

  const footerText = (options.footerText ?? '').trim();
  const includeFooter = footerText.length > 0;

  const images = pickImageArtifacts(bundle);
  if (images.length === 0) {
    const slide = pptx.addSlide();
    slide.addText('No exportable artifacts available.', { x: 0.5, y: 0.5, w: pageW - 1, h: 1, fontSize: 18, color: '333333' });
    const out = await pptx.write({ outputType: 'blob', compression: false });
    return out instanceof Blob
      ? out
      : new Blob([out as any], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  }

  for (const art of images) {
    // Prefer editable Sandbox export when the artifact contains the Sandbox SVG.
    const sandbox =
      art.data.kind === 'svg' && art.data.data.includes('analysisSandboxNode') ? extractSandboxFromSvgText(art.data.data) : null;

    const slide = pptx.addSlide();

    if (sandbox) {
      const availW = pageW - margin * 2;
      const availH = pageH - margin * 2 - (includeFooter ? 0.35 : 0);
      const scale = Math.min(availW / sandbox.vb.w, availH / sandbox.vb.h);
      const dx = margin + (availW - sandbox.vb.w * scale) / 2 - sandbox.vb.minX * scale;
      const dy = margin + (availH - sandbox.vb.h * scale) / 2 - sandbox.vb.minY * scale;

      const toX = (x: number) => dx + x * scale;
      const toY = (y: number) => dy + y * scale;
      const toW = (w: number) => w * scale;
      const toH = (h: number) => h * scale;

      // Edges first (behind nodes)
      for (const e of sandbox.edges) {
        const x1 = toX(e.x1);
        const y1 = toY(e.y1);
        const x2 = toX(e.x2);
        const y2 = toY(e.y2);

        const x = Math.min(x1, x2);
        const y = Math.min(y1, y2);
        const w = Math.abs(x2 - x1);
        const h = Math.abs(y2 - y1);

        slide.addShape((pptx as any).ShapeType.line, {
          x,
          y,
          w: Math.max(0.001, w),
          h: Math.max(0.001, h),
          line: {
            color: normalizePptxColor(e.stroke, '333333'),
            width: Math.max(0.25, e.strokeWidth * 0.75), // SVG px-ish to PPT pt-ish (rough)
            dash: dashToPptx(e.dash),
          },
        });
      }

      // Nodes
      for (const n of sandbox.nodes) {
        const x = toX(n.x);
        const y = toY(n.y);
        const w = toW(n.w);
        const h = toH(n.h);

        slide.addShape((pptx as any).ShapeType.roundRect, {
          x,
          y,
          w,
          h,
          fill: { color: normalizePptxColor(n.fill, 'FFFFFF') },
          line: { color: normalizePptxColor(n.stroke, '333333'), width: Math.max(0.5, n.strokeWidth * 0.75) },
        });

        // Title
        slide.addText(n.title || '(unnamed)', {
          x: x + 0.08,
          y: y + 0.08,
          w: Math.max(0.1, w - 0.16),
          h: 0.25,
          fontFace: 'Calibri',
          fontSize: 14,
          bold: true,
          color: normalizePptxColor(n.titleColor, '111111'),
        });

        // Meta/type
        slide.addText(n.meta || '', {
          x: x + 0.08,
          y: y + 0.36,
          w: Math.max(0.1, w - 0.16),
          h: 0.22,
          fontFace: 'Calibri',
          fontSize: 10,
          color: normalizePptxColor(n.metaColor, '333333'),
        });
      }

      if (includeFooter) {
        slide.addText(footerText, { x: 0.3, y: pageH - 0.35, w: pageW - 0.6, h: 0.3, fontSize: 10, color: '555555' });
      }
      continue;
    }

    // Fallback: image-based for non-sandbox images.
    let pngDataUrl: string | undefined;
    if (art.data.kind === 'png') {
      pngDataUrl = art.data.data.startsWith('data:') ? art.data.data : `data:image/png;base64,${art.data.data}`;
    } else if (art.data.kind === 'svg') {
      const pngBytes = await svgTextToPngBytes(art.data.data, { scale: 2, background: '#ffffff' });
      pngDataUrl = `data:image/png;base64,${bytesToBase64(pngBytes)}`;
    }

    if (!pngDataUrl) {
      slide.addText('Missing image content.', { x: 0.5, y: 0.5, w: pageW - 1, h: 1, fontSize: 18 });
      continue;
    }

    slide.addImage({ data: pngDataUrl, x: 0, y: 0, w: pageW, h: pageH });
    if (includeFooter) {
      slide.addText(footerText, { x: 0.3, y: pageH - 0.35, w: pageW - 0.6, h: 0.3, fontSize: 10, color: '555555' });
    }
  }

  const out = await pptx.write({ outputType: 'blob', compression: false });
  if (out instanceof Blob) return out;
  return new Blob([out as any], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
}

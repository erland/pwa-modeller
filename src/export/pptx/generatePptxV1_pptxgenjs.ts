import type { ExportArtifact, ExportBundle, ImageRef } from '../contracts/ExportBundle';
import type { PptxOptions } from '../contracts/ExportOptions';

import { svgTextToPngBytes } from './svgToPngBytes';
import PptxGenJS from 'pptxgenjs';
import { postProcessPptxWithJsZip } from './postProcessPptxWithJsZip';
import { PptxPostProcessMeta } from './pptxPostProcessMeta';
import { kindFromTypeId } from '../../domain';
import { getNotation } from '../../notations';
import type { RelationshipStyle, MarkerKind, LinePattern } from '../../diagram/relationships/style';

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


type ParsedNode = {
  id?: string;
  elType?: string;
    x: number; y: number; w: number; h: number;
  fill?: string; stroke?: string; strokeWidth?: number;
  text: string;
};

function parseTranslate(transform: string): { x: number; y: number } | null {
  // Handles: translate(x,y) or translate(x y)
  const mm = transform.match(/translate\(\s*([-0-9.]+)(?:[,\s]+)([-0-9.]+)\s*\)/);
  if (!mm) return null;
  return { x: Number(mm[1]), y: Number(mm[2]) };
}

function cssColorToHex(color: string | null | undefined): string | undefined {
  if (!color) return undefined;
  const c = color.trim();
  if (!c) return undefined;
  if (c.startsWith('#')) return c.replace('#', '').slice(0, 6);
  const rgb = c.match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) {
    const r = Number(rgb[1]).toString(16).padStart(2, '0');
    const g = Number(rgb[2]).toString(16).padStart(2, '0');
    const b = Number(rgb[3]).toString(16).padStart(2, '0');
    return `${r}${g}${b}`.toUpperCase();
  }
  // Named colors etc: let PowerPoint decide? fallback to black.
  return '000000';
}

function getInlineStyle(el: Element): Record<string, string> {
  const styleAttr = el.getAttribute('style') ?? '';
  const out: Record<string, string> = {};
  for (const part of styleAttr.split(';')) {
    const [k, v] = part.split(':');
    if (!k || v === undefined) continue;
    const key = k.trim();
    const val = v.trim();
    if (!key || !val) continue;
    out[key] = val;
  }
  return out;
}

function parseSandboxNodesFromSvg(svgText: string): ParsedNode[] {
  if (typeof DOMParser === 'undefined') return [];
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== 'svg') return [];

  const nodes: ParsedNode[] = [];
  const groups = Array.from(svg.querySelectorAll('g.analysisSandboxNode')) as Element[];

  for (const g of groups) {
    const tr = g.getAttribute('transform') ?? '';
    const t = parseTranslate(tr);
    if (!t) continue;

    const id = (g.getAttribute('data-element-id') ?? '').trim() || undefined;
    const elType = (g.getAttribute('data-element-type') ?? '').trim() || undefined;

    const rect = g.querySelector('rect');
    if (!rect) continue;

    const w = Number(rect.getAttribute('width') ?? '0');
    const h = Number(rect.getAttribute('height') ?? '0');
    if (!w || !h) continue;

    // Text: the node layer emits two <text> items (title + meta).
    const texts = Array.from(g.querySelectorAll('text')).map((tx) => (tx.textContent ?? '').trim()).filter(Boolean);
    if (texts.length === 0) continue;

    // Prefer computed-style inlined by export bundle (style attr).
    const style = getInlineStyle(rect);
    const fill = cssColorToHex(style.fill ?? rect.getAttribute('fill'));
    const stroke = cssColorToHex(style.stroke ?? rect.getAttribute('stroke'));
    const sw = Number((style['stroke-width'] ?? rect.getAttribute('stroke-width') ?? '1').trim());
    const strokeWidth = Number.isFinite(sw) ? sw : 1;

    nodes.push({
      id,
      elType,
      x: t.x,
      y: t.y,
      w,
      h,
      fill,
      stroke,
      strokeWidth,
      text: texts.slice(0, 2).join('\n'),
    });
  }

  // Fallback to old heuristic if class selector didn't match (older builds)
  if (!nodes.length) {
    const legacyGroups = Array.from(svg.querySelectorAll('g[transform]'));
    for (const g of legacyGroups) {
      const tr = g.getAttribute('transform') ?? '';
      const t = parseTranslate(tr);
      if (!t) continue;
      const rect = g.querySelector('rect');
      if (!rect) continue;
      const w = Number(rect.getAttribute('width') ?? '0');
      const h = Number(rect.getAttribute('height') ?? '0');
      if (!w || !h) continue;
      const texts = Array.from(g.querySelectorAll('text')).map((tx) => (tx.textContent ?? '').trim()).filter(Boolean);
      if (texts.length === 0) continue;
      const style = getInlineStyle(rect);
      const fill = cssColorToHex(style.fill ?? rect.getAttribute('fill'));
      const stroke = cssColorToHex(style.stroke ?? rect.getAttribute('stroke'));
      const sw = Number((style['stroke-width'] ?? rect.getAttribute('stroke-width') ?? '1').trim());
      const strokeWidth = Number.isFinite(sw) ? sw : 1;
      nodes.push({ x: t.x, y: t.y, w, h, fill, stroke, strokeWidth, text: texts.slice(0, 2).join('\n') });
    }
  }

  return nodes;
}



type ParsedEdge = {
  id?: string;
  sourceId?: string;
  targetId?: string;
  relType?: string;
  x1: number; y1: number; x2: number; y2: number;
  stroke?: string;
  strokeWidth?: number;
  dashed?: boolean;
  arrowEnd?: boolean;
  linePattern?: 'solid' | 'dashed' | 'dotted';
  markerStart?: MarkerKind;
  markerEnd?: MarkerKind;
  pptxHeadEnd?: 'none' | 'arrow' | 'triangle' | 'diamond' | 'oval';
  pptxTailEnd?: 'none' | 'arrow' | 'triangle' | 'diamond' | 'oval';
};

function parsePathEndpoints(d: string): { x1: number; y1: number; x2: number; y2: number } | null {
  const nums = d.match(/[-0-9.]+/g);
  if (!nums || nums.length < 4) return null;
  const arr = nums.map(Number).filter((n) => Number.isFinite(n));
  if (arr.length < 4) return null;
  const x1 = arr[0], y1 = arr[1];
  const x2 = arr[arr.length - 2], y2 = arr[arr.length - 1];
  return { x1, y1, x2, y2 };
}

function getSandboxRelationshipStyle(type: string, attrs?: unknown): RelationshipStyle | null {
  try {
    const kind = kindFromTypeId(type);
    const notation = getNotation(kind);
    return notation.getRelationshipStyle({ type: String(type), attrs });
  } catch {
    return null;
  }
}

function markerKindToPptxEnd(kind: MarkerKind | undefined): 'none' | 'arrow' | 'triangle' | 'diamond' | 'oval' {
  switch (kind) {
    case 'arrowOpen':
      return 'arrow';
    case 'arrowFilled':
      return 'triangle';
    case 'triangleOpen':
    case 'triangleFilled':
      return 'triangle';
    case 'diamondOpen':
    case 'diamondFilled':
      return 'diamond';
    case 'circleOpen':
    case 'circleFilled':
      return 'oval';
    case 'none':
    default:
      return 'none';
  }
}

function dashPatternFromStyle(style: RelationshipStyle | null): LinePattern | 'solid' {
  const p = style?.line?.pattern;
  if (p === 'dashed' || p === 'dotted') return p;
  if (style?.line?.dasharray) {
    // Heuristic: treat any dasharray as dashed unless it looks like dotted ("2 4").
    const da = String(style.line.dasharray).trim();
    if (/^2\s+4$/.test(da) || /^2,4$/.test(da)) return 'dotted';
    return 'dashed';
  }
  return 'solid';
}

function parseSandboxEdgesFromSvg(svgText: string): ParsedEdge[] {
  if (typeof DOMParser === 'undefined') return [];
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== 'svg') return [];

  const edges: ParsedEdge[] = [];

  // Primary: use sandbox edge path with semantic data-* attributes.
  const paths = Array.from(svg.querySelectorAll('path.diagramRelLine')) as Element[];
  for (const el of paths) {
    const d = (el.getAttribute('d') ?? '').trim();
    const pts = d ? parsePathEndpoints(d) : null;
    if (!pts) continue;

    const id = (el.getAttribute('data-relationship-id') ?? el.getAttribute('data-id') ?? el.getAttribute('id') ?? '').trim() || undefined;
    const sourceId = (el.getAttribute('data-source-element-id') ?? el.getAttribute('data-source') ?? el.getAttribute('data-src') ?? '').trim() || undefined;
    const targetId = (el.getAttribute('data-target-element-id') ?? el.getAttribute('data-target') ?? el.getAttribute('data-dst') ?? '').trim() || undefined;
    const relType = (el.getAttribute('data-relationship-type') ?? el.getAttribute('data-type') ?? '').trim() || undefined;

    // Styling: use the same notation-driven relationship style as the Sandbox renderer.
const relStyle = getSandboxRelationshipStyle(String(relType ?? ''), undefined);
const linePattern = dashPatternFromStyle(relStyle);
const markerStart = relStyle?.markerStart ?? 'none';
const markerEnd = relStyle?.markerEnd ?? 'none';
const pptxHeadEnd = markerKindToPptxEnd(markerStart);
    let pptxTailEnd = markerKindToPptxEnd(markerEnd);
    // UML aggregation/composition: PowerPoint's built-in diamond renders reliably as tailEnd.
    // Sandbox uses markerStart for uml.aggregation/uml.composition; map that to tailEnd.
    if (markerStart === 'diamondOpen' || markerStart === 'diamondFilled') {
      pptxTailEnd = 'diamond';
    }

const dashed = linePattern === 'dashed' || linePattern === 'dotted';
const arrowEnd = pptxTailEnd !== 'none';

    // Stroke: often set via computed styles; bundle inlines them into style="".
    const style = getInlineStyle(el);
    const stroke = cssColorToHex(style.stroke ?? el.getAttribute('stroke'));
    const sw = Number((style['stroke-width'] ?? el.getAttribute('stroke-width') ?? '1').trim());
    const strokeWidth = Number.isFinite(sw) ? sw : 1;

    edges.push({ id, sourceId, targetId, relType, x1: pts.x1, y1: pts.y1, x2: pts.x2, y2: pts.y2, stroke, strokeWidth, dashed, arrowEnd, linePattern, markerStart, markerEnd, pptxHeadEnd, pptxTailEnd });
  }

  // Fallback: any <path> with a 'd' (legacy)
  if (!edges.length) {
    const legacy = Array.from(svg.querySelectorAll('path'));
    for (const el of legacy) {
      const d = (el.getAttribute('d') ?? '').trim();
      const pts = d ? parsePathEndpoints(d) : null;
      if (!pts) continue;
      const id = (el.getAttribute('data-id') ?? el.getAttribute('id') ?? '').trim() || undefined;
      const style = getInlineStyle(el);
      const stroke = cssColorToHex(style.stroke ?? el.getAttribute('stroke'));
      const sw = Number((style['stroke-width'] ?? el.getAttribute('stroke-width') ?? '1').trim());
      const strokeWidth = Number.isFinite(sw) ? sw : 1;
      const dash = (style['stroke-dasharray'] ?? el.getAttribute('stroke-dasharray') ?? '').trim();
      const dashed = !!dash && dash !== 'none';
      const markerEnd = (el.getAttribute('marker-end') ?? '').trim();
      const arrowEnd = !!markerEnd;
      edges.push({ id, x1: pts.x1, y1: pts.y1, x2: pts.x2, y2: pts.y2, stroke, strokeWidth, dashed, arrowEnd });
    }
  }

  return edges;
}


function parseSvgViewBox(svgText: string): { minX: number; minY: number; w: number; h: number } | null {
  if (typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svg = doc.documentElement;
  if (!svg) return null;
  const vb = (svg.getAttribute('viewBox') ?? '').trim();
  if (vb) {
    const parts = vb.split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      return { minX: parts[0], minY: parts[1], w: parts[2], h: parts[3] };
    }
  }
  const wAttr = Number((svg.getAttribute('width') ?? '').replace(/px$/, ''));
  const hAttr = Number((svg.getAttribute('height') ?? '').replace(/px$/, ''));
  if (Number.isFinite(wAttr) && Number.isFinite(hAttr) && wAttr > 0 && hAttr > 0) return { minX: 0, minY: 0, w: wAttr, h: hAttr };
  return null;
}

function layoutToPptxGen(layout: PptxOptions['layout']): string {
  return layout === 'standard' ? 'LAYOUT_4X3' : 'LAYOUT_WIDE';
}

/**
 * PPTX generation v1 (image-based slides) using PptxGenJS.
 *
 * This replaces the earlier hand-rolled OOXML approach, which some PowerPoint
 * builds rejected as invalid. PptxGenJS produces PowerPoint-compatible output.
 */
export async function generatePptxBlobV1(bundle: ExportBundle, options: PptxOptions): Promise<Blob> {
  const pptx = new PptxGenJS();
  pptx.layout = layoutToPptxGen(options.layout);
  pptx.author = 'EA Modeller PWA';
  pptx.company = 'EA Modeller PWA';
  pptx.subject = bundle.title;
  pptx.title = bundle.title;

  const images = pickImageArtifacts(bundle);
  if (images.length === 0) {
    // Always produce a valid PPTX.
    const slide = pptx.addSlide();
    slide.addText('No image artifacts available for export.', {
      x: 0.5,
      y: 0.5,
      w: 9,
      h: 1,
      fontSize: 18,
      color: '333333',
    });
  }

  // PptxGenJS uses inches for coordinates.
  // Standard (4:3) is 10" × 7.5". Wide is 13.33" × 7.5".
  const pageW = options.layout === 'standard' ? 10 : 13.333;
  const pageH = 7.5;

  let meta: PptxPostProcessMeta | undefined;

  const footerText = (options.footerText ?? '').trim();
  const includeFooter = footerText.length > 0;

  for (const art of images) {
    const slide = pptx.addSlide();

    // Ensure we always embed PNG data (even if the artifact is SVG markup).
    let pngDataUrl: string | undefined;
    if (art.data.kind === 'png') {
      // Already a data URL.
      pngDataUrl = art.data.data.startsWith('data:') ? art.data.data : `data:image/png;base64,${art.data.data}`;
    } else if (art.data.kind === 'svg') {
      const pngBytes = await svgTextToPngBytes(art.data.data, { scale: 2, background: '#ffffff' });
      pngDataUrl = `data:image/png;base64,${bytesToBase64(pngBytes)}`;
    }

// PPTX v2 (Step 1): Render Sandbox nodes as a single shape-with-text so moving the element in PowerPoint moves its text.
// This is a best-effort path for SVG artifacts that represent the Sandbox graph.
if (art.data.kind === 'svg') {
  try {
    const vb = parseSvgViewBox(art.data.data) ?? { minX: 0, minY: 0, w: 1000, h: 750 };
const nodes = parseSandboxNodesFromSvg(art.data.data);
const edges = parseSandboxEdgesFromSvg(art.data.data);

if (nodes.length > 0) {
  // Fit uniformly to slide (inches) and center, respecting viewBox minX/minY.
  const scale = Math.min(pageW / vb.w, pageH / vb.h);
  const offX = (pageW - vb.w * scale) / 2;
  const offY = (pageH - vb.h * scale) / 2;

// Collect geometry meta for post-process connector attachment.
meta = { nodes: [], edges: [] };




// Use plain string shape names to avoid relying on non-typed static enums.
const ShapeType: Record<string, string> = {
  line: 'line',
  rect: 'rect',
  roundRect: 'roundRect',
};
const lineShape = ShapeType?.line ?? 'line';
const roundRect = ShapeType?.roundRect ?? 'roundRect';

// Temporary connectors as plain lines (visual correctness). These are editable but not attached.
// Draw edges first so they appear behind nodes.
if (edges.length > 0) {
  let edgeIdx = 0;
  for (const e of edges) {
    const x1 = offX + (e.x1 - vb.minX) * scale;
    const y1 = offY + (e.y1 - vb.minY) * scale;
    const x2 = offX + (e.x2 - vb.minX) * scale;
    const y2 = offY + (e.y2 - vb.minY) * scale;

    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    const w = Math.max(0.01, Math.abs(x2 - x1));
    const h = Math.max(0.01, Math.abs(y2 - y1));


    const relLower = String(e.relType ?? '').toLowerCase();
            const forcedHeadEnd = (relLower.includes('composition') || relLower.includes('aggregation')) ? 'diamond' : (e.pptxHeadEnd ?? undefined);
            const forcedTailEnd = (relLower.includes('composition') || relLower.includes('aggregation')) ? 'none' : (e.pptxTailEnd ?? undefined);

            meta.edges.push({
      edgeId: String(e.id ?? `${edgeIdx}`),
      fromNodeId: e.sourceId ?? undefined,
      toNodeId: e.targetId ?? undefined,
      relType: e.relType,
      linePattern: e.linePattern ?? (e.dashed ? 'dashed' : 'solid'),
      markerStart: e.markerStart ?? undefined,
      markerEnd: e.markerEnd ?? undefined,
      pptxHeadEnd: forcedHeadEnd,
      pptxTailEnd: forcedTailEnd,
      strokeHex: typeof e.stroke === 'string' ? e.stroke : undefined,
      strokeWidthPt: typeof e.strokeWidth === 'number' ? Math.max(0.25, e.strokeWidth * 0.75) : undefined,
      dashed: e.dashed,
      x1In: x1,
      y1In: y1,
      x2In: x2,
      y2In: y2,
      rectIn: { x, y, w, h },
    });


    slide.addShape(lineShape, {
      x,
      y,
      w,
      h,
      altText: `EA_EDGEID:${String(e.id ?? edgeIdx)}|${e.sourceId ?? ''}->${e.targetId ?? ''}|${e.relType ?? ''}|h=${(e.pptxHeadEnd ?? 'none')}|t=${(e.pptxTailEnd ?? 'none')}|p=${(e.linePattern ?? (e.dashed ? 'dashed' : 'solid'))}`,
      line: {
        color: e.stroke ?? '333333',
        width: Math.max(0.5, (e.strokeWidth ?? 1) * scale),
        dash: e.dashed ? 'dash' : 'solid',
        endArrowType: e.arrowEnd ? 'arrow' : undefined,
      },
    });

    edgeIdx += 1;
  }
}

      for (const n of nodes) {
                    const x = offX + (n.x - vb.minX) * scale;
            const y = offY + (n.y - vb.minY) * scale;
            const w = n.w * scale;
            const h = n.h * scale;

            const [nameLine0, typeLine0] = n.text.split('\n');
            meta.nodes.push({
              elementId: String(n.id ?? `${nodes.indexOf(n)}`),
              name: (nameLine0 ?? '').trim() || String(n.id ?? `${nodes.indexOf(n)}`),
              typeLabel: (typeLine0 ?? '').trim() || undefined,
              rectIn: { x, y, w, h },
              fillHex: n.fill ?? undefined,
              strokeHex: n.stroke ?? undefined,
              textHex: '111111',
            });

                    const [nameLine, typeLine] = n.text.split('\n');
            const runs: import('pptxgenjs').TextRun[] = [];
            if (nameLine) runs.push({ text: nameLine + (typeLine ? '\n' : ''), options: { bold: true, fontSize: 14 } });
            if (typeLine) runs.push({ text: typeLine, options: { italic: true, fontSize: 10 } });
            slide.addText(runs.length ? runs : n.text, {
              altText: n.id ? `EA_NODE:${n.id}` : undefined,
shape: roundRect,
          x,
          y,
          w,
          h,
          fill: n.fill ? { color: n.fill } : undefined,
          line: n.stroke ? { color: n.stroke, width: Math.max(0.5, (n.strokeWidth ?? 1) * scale) } : undefined,
          fontFace: 'Calibri',
          fontSize: 10,
          color: '111111',
          valign: 'mid',
          align: 'center',
          margin: 4,
                    });

      }

      // Optional: still set pngDataUrl so older behavior remains available if needed.
      // We skip addImage by setting pngDataUrl to a sentinel.
      pngDataUrl = '__SKIP_IMAGE__';
    }
  } catch {
    // Fall back to PNG image export.
  }
}


    if (!pngDataUrl) {
      slide.addText('Missing image content.', { x: 0.5, y: 0.5, w: pageW - 1, h: 1, fontSize: 18 });
      continue;
    }

    if (pngDataUrl !== '__SKIP_IMAGE__') {
    // Full-bleed placement.
    slide.addImage({
      data: pngDataUrl,
      x: 0,
      y: 0,
      w: pageW,
      h: pageH,
    });
    }

    if (includeFooter) {
      // Small footer strip at bottom.
      slide.addText(footerText, {
        x: 0.3,
        y: pageH - 0.35,
        w: pageW - 0.6,
        h: 0.3,
        fontSize: 10,
        color: '555555',
      });
    }
  }

  // Request a Uint8Array payload (browser-friendly) and post-process the zip.
  const raw = await pptx.write('nodebuffer');
  const processed = await postProcessPptxWithJsZip(raw, meta);
  const safeProcessed = new Uint8Array(processed);
  return new Blob([safeProcessed], {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
}

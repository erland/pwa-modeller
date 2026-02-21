import type { PptxDiagramIR, PptxEdgeIR, PptxNodeIR } from '../ir/types';
import type { PptxPostProcessMeta } from '../pptxPostProcessMeta';

import { kindFromTypeId } from '../../../domain';
import { getNotation } from '../../../notations';
import type { LinePattern, MarkerKind, RelationshipStyle } from '../../../diagram/relationships/style';

type ParsedViewBox = { minX: number; minY: number; w: number; h: number };

type ParsedNode = {
  id?: string;
  elType?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  text: string;
};

type ParsedEdge = {
  id?: string;
  sourceId?: string;
  targetId?: string;
  relType?: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke?: string;
  strokeWidth?: number;
  dashed?: boolean;
  linePattern?: 'solid' | 'dashed' | 'dotted';
  markerStart?: MarkerKind;
  markerEnd?: MarkerKind;
  pptxHeadEnd?: 'none' | 'arrow' | 'triangle' | 'diamond' | 'oval';
  pptxTailEnd?: 'none' | 'arrow' | 'triangle' | 'diamond' | 'oval';
};

function parseTranslate(transform: string): { x: number; y: number } | null {
  const mm = transform.match(/translate\(\s*([-0-9.]+)(?:[,\s]+)([-0-9.]+)\s*\)/);
  if (!mm) return null;
  return { x: Number(mm[1]), y: Number(mm[2]) };
}

function cssColorToHex(color: string | null | undefined): string | undefined {
  if (!color) return undefined;
  const c = color.trim();
  if (!c) return undefined;
  if (c.startsWith('#')) return c.replace('#', '').slice(0, 6).toUpperCase();
  const rgb = c.match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) {
    const r = Number(rgb[1]).toString(16).padStart(2, '0');
    const g = Number(rgb[2]).toString(16).padStart(2, '0');
    const b = Number(rgb[3]).toString(16).padStart(2, '0');
    return `${r}${g}${b}`.toUpperCase();
  }
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

function parseSvgViewBox(svgText: string): ParsedViewBox | null {
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

    const texts = Array.from(g.querySelectorAll('text'))
      .map((tx) => (tx.textContent ?? '').trim())
      .filter(Boolean);
    if (texts.length === 0) continue;

    const style = getInlineStyle(rect);
    const fill = cssColorToHex(style.fill ?? rect.getAttribute('fill'));
    const stroke = cssColorToHex(style.stroke ?? rect.getAttribute('stroke'));
    const sw = Number((style['stroke-width'] ?? rect.getAttribute('stroke-width') ?? '1').trim());
    const strokeWidth = Number.isFinite(sw) ? sw : 1;

    nodes.push({ id, elType, x: t.x, y: t.y, w, h, fill, stroke, strokeWidth, text: texts.slice(0, 2).join('\n') });
  }

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
      const texts = Array.from(g.querySelectorAll('text'))
        .map((tx) => (tx.textContent ?? '').trim())
        .filter(Boolean);
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

function parsePathEndpoints(d: string): { x1: number; y1: number; x2: number; y2: number } | null {
  const nums = d.match(/[-0-9.]+/g);
  if (!nums || nums.length < 4) return null;
  const arr = nums.map(Number).filter((n) => Number.isFinite(n));
  if (arr.length < 4) return null;
  const x1 = arr[0],
    y1 = arr[1];
  const x2 = arr[arr.length - 2],
    y2 = arr[arr.length - 1];
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

  const paths = Array.from(svg.querySelectorAll('path.diagramRelLine')) as Element[];
  for (const el of paths) {
    const d = (el.getAttribute('d') ?? '').trim();
    const pts = d ? parsePathEndpoints(d) : null;
    if (!pts) continue;

    const id = (el.getAttribute('data-relationship-id') ?? el.getAttribute('data-id') ?? el.getAttribute('id') ?? '').trim() || undefined;
    const sourceId = (el.getAttribute('data-source-element-id') ?? el.getAttribute('data-source') ?? el.getAttribute('data-src') ?? '').trim() || undefined;
    const targetId = (el.getAttribute('data-target-element-id') ?? el.getAttribute('data-target') ?? el.getAttribute('data-dst') ?? '').trim() || undefined;
    const relType = (el.getAttribute('data-relationship-type') ?? el.getAttribute('data-type') ?? '').trim() || undefined;

    const relStyle = getSandboxRelationshipStyle(String(relType ?? ''), undefined);
    const linePattern = dashPatternFromStyle(relStyle);
    const markerStart = relStyle?.markerStart ?? 'none';
    const markerEnd = relStyle?.markerEnd ?? 'none';
    const pptxHeadEnd = markerKindToPptxEnd(markerStart);
    let pptxTailEnd = markerKindToPptxEnd(markerEnd);
    if (markerStart === 'diamondOpen' || markerStart === 'diamondFilled') {
      pptxTailEnd = 'diamond';
    }

    const dashed = linePattern === 'dashed' || linePattern === 'dotted';

    const style = getInlineStyle(el);
    const stroke = cssColorToHex(style.stroke ?? el.getAttribute('stroke'));
    const sw = Number((style['stroke-width'] ?? el.getAttribute('stroke-width') ?? '1').trim());
    const strokeWidth = Number.isFinite(sw) ? sw : 1;

    edges.push({
      id,
      sourceId,
      targetId,
      relType,
      x1: pts.x1,
      y1: pts.y1,
      x2: pts.x2,
      y2: pts.y2,
      stroke,
      strokeWidth,
      dashed,
      linePattern,
      markerStart,
      markerEnd,
      pptxHeadEnd,
      pptxTailEnd,
    });
  }

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
      edges.push({ id, x1: pts.x1, y1: pts.y1, x2: pts.x2, y2: pts.y2, stroke, strokeWidth, dashed });
    }
  }

  return edges;
}

export type SandboxToIrResult = { handled: boolean; diagram?: PptxDiagramIR; meta?: PptxPostProcessMeta };

export function sandboxSvgToPptxDiagramIR(svgText: string, env: { pageW: number; pageH: number }): SandboxToIrResult {
  try {
    const vb = parseSvgViewBox(svgText) ?? { minX: 0, minY: 0, w: 1000, h: 750 };
    const nodes = parseSandboxNodesFromSvg(svgText);
    const edges = parseSandboxEdgesFromSvg(svgText);
    if (nodes.length === 0) return { handled: false };

    const scale = Math.min(env.pageW / vb.w, env.pageH / vb.h);
    const offX = (env.pageW - vb.w * scale) / 2;
    const offY = (env.pageH - vb.h * scale) / 2;

    const meta: PptxPostProcessMeta = { nodes: [], edges: [] };

    const irNodes: PptxNodeIR[] = nodes.map((n, idx) => {
      const x = offX + (n.x - vb.minX) * scale;
      const y = offY + (n.y - vb.minY) * scale;
      const w = n.w * scale;
      const h = n.h * scale;

      const [nameLine0, typeLine0] = n.text.split('\n');
      meta.nodes.push({
        elementId: String(n.id ?? `${idx}`),
        name: (nameLine0 ?? '').trim() || String(n.id ?? `${idx}`),
        typeLabel: (typeLine0 ?? '').trim() || undefined,
        rectIn: { x, y, w, h },
        fillHex: n.fill ?? undefined,
        strokeHex: n.stroke ?? undefined,
        textHex: '111111',
      });

      return {
        id: String(n.id ?? `${idx}`),
        x,
        y,
        w,
        h,
        shape: 'roundRect',
        fill: n.fill,
        stroke: n.stroke,
        strokeWidth: typeof n.strokeWidth === 'number' ? Math.max(0.5, n.strokeWidth * scale) : undefined,
        text: n.text,
        textColor: '111111',
      };
    });

    const irEdges: PptxEdgeIR[] = [];
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
      const forcedHeadEnd = relLower.includes('composition') || relLower.includes('aggregation') ? 'diamond' : (e.pptxHeadEnd ?? undefined);
      const forcedTailEnd = relLower.includes('composition') || relLower.includes('aggregation') ? 'none' : (e.pptxTailEnd ?? undefined);

      const edgeId = String(e.id ?? `${edgeIdx}`);

      meta.edges.push({
        edgeId,
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

      irEdges.push({
        id: edgeId,
        kind: 'connector',
        fromId: String(e.sourceId ?? ''),
        toId: String(e.targetId ?? ''),
        stroke: e.stroke,
        strokeWidth: typeof e.strokeWidth === 'number' ? Math.max(0.5, (e.strokeWidth ?? 1) * scale) : undefined,
        dashed: e.dashed,
        linePattern: e.linePattern ?? (e.dashed ? 'dashed' : 'solid'),
        markerStart: e.markerStart,
        markerEnd: e.markerEnd,
        pptxHeadEnd: forcedHeadEnd,
        pptxTailEnd: forcedTailEnd,
        relType: e.relType,
        path: [
          { x: x1, y: y1 },
          { x: x2, y: y2 },
        ],
      });

      edgeIdx += 1;
    }

    const diagram: PptxDiagramIR = { nodes: irNodes, edges: irEdges };
    return { handled: true, diagram, meta };
  } catch {
    return { handled: false };
  }
}

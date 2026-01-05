import type { Model, RelationshipType, ViewNodeLayout } from '../../domain';

type Point = { x: number; y: number };

type RelationshipVisual = {
  markerStartId?: string;
  markerEndId?: string;
  dasharray?: string;
  showInfluenceLabel?: boolean;
};

function relationshipVisual(type: RelationshipType): RelationshipVisual {
  switch (type) {
    case 'Association':
      return {};
    case 'Composition':
      return { markerStartId: 'diamondFilled' };
    case 'Aggregation':
      return { markerStartId: 'diamondOpen' };
    case 'Specialization':
      return { markerEndId: 'triangleOpen' };
    case 'Realization':
      return { markerEndId: 'triangleOpen', dasharray: '6 5' };
    case 'Serving':
      return { markerEndId: 'arrowOpen', dasharray: '6 5' };
    case 'Flow':
      return { markerEndId: 'arrowOpen', dasharray: '6 5' };
    case 'Triggering':
      return { markerEndId: 'arrowOpen' };
    case 'Assignment':
      return { markerEndId: 'arrowFilled' };
    case 'Access':
      return { markerEndId: 'arrowOpen' };
    case 'Influence':
      return { markerEndId: 'arrowOpen', dasharray: '2 4', showInfluenceLabel: true };
    default:
      return { markerEndId: 'arrowOpen' };
  }
}

function rectEdgeAnchor(n: ViewNodeLayout, toward: Point): Point {
  const w = n.width ?? 120;
  const h = n.height ?? 60;
  const cx = n.x + w / 2;
  const cy = n.y + h / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  const sx = adx === 0 ? Number.POSITIVE_INFINITY : (w / 2) / adx;
  const sy = ady === 0 ? Number.POSITIVE_INFINITY : (h / 2) / ady;
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

function unitPerp(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (!Number.isFinite(len) || len < 1e-6) return { x: 0, y: -1 };
  return { x: -dy / len, y: dx / len };
}

function polylineMidPoint(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  }
  const half = total / 2;
  let acc = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (acc + seg >= half && seg > 1e-6) {
      const t = (half - acc) / seg;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    acc += seg;
  }
  return points[Math.max(0, points.length - 1)];
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

function boundsForNodes(nodes: ViewNodeLayout[]): Bounds {
  if (nodes.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + (n.width ?? 0));
    maxY = Math.max(maxY, n.y + (n.height ?? 0));
  }
  return { minX, minY, maxX, maxY };
}

export function createViewSvg(model: Model, viewId: string): string {
  const view = model.views[viewId];
  if (!view) throw new Error(`View not found: ${viewId}`);
  const nodes = view.layout?.nodes ?? [];

  const padding = 20;
  const b = boundsForNodes(nodes);

  // Minimum size for empty views.
  const width = Math.max(640, (b.maxX - b.minX) + padding * 2);
  const height = Math.max(420, (b.maxY - b.minY) + padding * 2);
  const offsetX = -b.minX + padding;
  const offsetY = -b.minY + padding;

  const nodeByElement = new Map(nodes.map((n) => [n.elementId, n] as const));

  // Relationships: draw only if both endpoints are present as nodes in this view.
  type RelItem = {
    relId: string;
    type: RelationshipType;
    d: string;
    label: string;
    visual: RelationshipVisual;
    mid: Point;
  };

  const relItemsRaw: Array<{ relId: string; aId: string; bId: string }> = [];
  for (const rel of Object.values(model.relationships)) {
    const s = nodeByElement.get(rel.sourceElementId);
    const t = nodeByElement.get(rel.targetElementId);
    if (!s || !t) continue;
    const a = [rel.sourceElementId, rel.targetElementId].sort();
    relItemsRaw.push({ relId: rel.id, aId: a[0], bId: a[1] });
  }

  const groups = new Map<string, string[]>();
  for (const r of relItemsRaw) {
    const key = `${r.aId}|${r.bId}`;
    const arr = groups.get(key) ?? [];
    arr.push(r.relId);
    groups.set(key, arr);
  }

  const relItems: RelItem[] = [];
  for (const [key, relIds] of groups) {
    const total = relIds.length;
    for (let i = 0; i < relIds.length; i += 1) {
      const relId = relIds[i];
      const rel = model.relationships[relId];
      if (!rel) continue;
      const s0 = nodeByElement.get(rel.sourceElementId);
      const t0 = nodeByElement.get(rel.targetElementId);
      if (!s0 || !t0) continue;

      const s: ViewNodeLayout = { ...s0, x: s0.x + offsetX, y: s0.y + offsetY };
      const t: ViewNodeLayout = { ...t0, x: t0.x + offsetX, y: t0.y + offsetY };

      const sc: Point = { x: s.x + s.width / 2, y: s.y + s.height / 2 };
      const tc: Point = { x: t.x + t.width / 2, y: t.y + t.height / 2 };

      let start = rectEdgeAnchor(s, tc);
      let end = rectEdgeAnchor(t, sc);

      if (total > 1) {
        const spacing = 14;
        const offsetIndex = i - (total - 1) / 2;
        const off = offsetIndex * spacing;
        const [aId, bId] = key.split('|');
        const aN0 = nodeByElement.get(aId);
        const bN0 = nodeByElement.get(bId);
        const aN = aN0 ? ({ ...aN0, x: aN0.x + offsetX, y: aN0.y + offsetY } as ViewNodeLayout) : null;
        const bN = bN0 ? ({ ...bN0, x: bN0.x + offsetX, y: bN0.y + offsetY } as ViewNodeLayout) : null;
        const aC: Point | null = aN ? { x: aN.x + aN.width / 2, y: aN.y + aN.height / 2 } : null;
        const bC: Point | null = bN ? { x: bN.x + bN.width / 2, y: bN.y + bN.height / 2 } : null;
        const perp = aC && bC ? unitPerp(aC, bC) : unitPerp(sc, tc);
        start = { x: start.x + perp.x * off, y: start.y + perp.y * off };
        end = { x: end.x + perp.x * off, y: end.y + perp.y * off };
      }

      const pts: Point[] = [start, end];
      const d = `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
      const visual = relationshipVisual(rel.type);
      const mid = polylineMidPoint(pts);
      relItems.push({ relId, type: rel.type, d, label: rel.type, visual, mid });
    }
  }

  const linesSvg = relItems
    .map((it) => {
      const markerStart = it.visual.markerStartId ? ` marker-start="url(#${it.visual.markerStartId})"` : '';
      const markerEnd = it.visual.markerEndId ? ` marker-end="url(#${it.visual.markerEndId})"` : '';
      const dash = it.visual.dasharray ? ` stroke-dasharray="${it.visual.dasharray}"` : '';
      const influence = it.visual.showInfluenceLabel
        ? `<text x="${it.mid.x}" y="${it.mid.y - 6}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="12" font-weight="800" fill="rgba(0,0,0,0.65)" text-anchor="middle">±</text>`
        : '';

      // Keep the type label in exports (helps interpretation if arrow styles are unfamiliar).
      const label = `<text x="${it.mid.x}" y="${it.mid.y - 4}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="11" fill="#334155" text-anchor="middle">${escapeXml(it.label)}</text>`;

      return [
        `<path d="${it.d}" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="2"${dash}${markerStart}${markerEnd} />`,
        influence,
        label,
      ].join('');
    })
    .join('');

  const nodesSvg = nodes
    .map((n) => {
      const el = model.elements[n.elementId];
      if (!el) return '';
      const x = n.x + offsetX;
      const y = n.y + offsetY;
      const name = el.name || '(unnamed)';
      const type = el.type;
      const tag = n.styleTag;
      const highlight = n.highlighted;

      const tagSvg = tag
        ? `<g>
            <rect x="${x + 8}" y="${y + n.height - 22}" width="${Math.max(28, tag.length * 7)}" height="16" rx="8" fill="#e2e8f0" />
            <text x="${x + 14}" y="${y + n.height - 10}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="11" fill="#0f172a">${escapeXml(tag)}</text>
          </g>`
        : '';

      return `
        <g>
          <rect x="${x}" y="${y}" width="${n.width}" height="${n.height}" rx="10" fill="#ffffff" stroke="${highlight ? '#f59e0b' : '#cbd5e1'}" stroke-width="${highlight ? 2 : 1}" />
          <text x="${x + 10}" y="${y + 22}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="13" font-weight="700" fill="#0f172a">${escapeXml(name)}</text>
          <text x="${x + 10}" y="${y + 40}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="12" fill="#334155">${escapeXml(type)}</text>
          ${tagSvg}
        </g>
      `;
    })
    .join('');

  const title = escapeXml(view.name);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <marker id="arrowOpen" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="1.6" stroke-linejoin="round" />
    </marker>
    <marker id="arrowFilled" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(0,0,0,0.55)" />
    </marker>
    <marker id="triangleOpen" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="1.6" stroke-linejoin="round" />
    </marker>
    <marker id="diamondOpen" viewBox="0 0 10 10" refX="0" refY="5" markerWidth="10" markerHeight="10" orient="auto">
      <path d="M 0 5 L 5 0 L 10 5 L 5 10 z" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="1.6" stroke-linejoin="round" />
    </marker>
    <marker id="diamondFilled" viewBox="0 0 10 10" refX="0" refY="5" markerWidth="10" markerHeight="10" orient="auto">
      <path d="M 0 5 L 5 0 L 10 5 L 5 10 z" fill="rgba(0,0,0,0.55)" />
    </marker>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" />
  <text x="${padding}" y="${padding}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="14" font-weight="700" fill="#0f172a">${title}</text>
  <g transform="translate(0, 12)">
    ${linesSvg}
    ${nodesSvg}
  </g>
</svg>`;

  return svg;
}

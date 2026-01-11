import type { Model, RelationshipType, ViewNodeLayout, ArchimateLayer, ElementType, ViewConnection } from '../../domain';
import { ELEMENT_TYPES_BY_LAYER } from '../../domain';
import { refKey } from './connectable';
import { getConnectionPath, polylineToSvgPath } from './connectionPath';
import { applyLaneOffsets } from './connectionLanes';
import { orthogonalRoutingHintsFromAnchors } from './orthogonalHints';
import {
  boundsForNodes,
  nodeRefFromLayout,
  offsetPolyline,
  polylineMidPoint,
  rectEdgeAnchor,
  unitPerp,
  type Point,
} from './geometry';

const ELEMENT_TYPE_TO_LAYER: Partial<Record<ElementType, ArchimateLayer>> = (() => {
  const map: Partial<Record<ElementType, ArchimateLayer>> = {};
  (Object.keys(ELEMENT_TYPES_BY_LAYER) as ArchimateLayer[]).forEach((layer) => {
    for (const t of ELEMENT_TYPES_BY_LAYER[layer] ?? []) map[t] = layer;
  });
  return map;
})();

const LAYER_FILL: Record<ArchimateLayer, string> = {
  Strategy: '#f0d1c0',
  Motivation: '#eadcff',
  Business: '#fff0b3',
  Application: '#d4ebff',
  Technology: '#d8f5df',
  Physical: '#d8f5df',
  ImplementationMigration: '#ffd0e0',
};

type RelationshipVisual = {
  markerStartId?: string;
  markerEndId?: string;
  dasharray?: string;
  /** Optional label rendered near the relationship mid point (e.g. Influence strength). */
  midLabel?: string;
};

function relationshipVisual(rel: { type: RelationshipType; attrs?: { isDirected?: boolean; influenceStrength?: string } }): RelationshipVisual {
  const influenceStrength = (rel.attrs?.influenceStrength ?? '').trim();

  switch (rel.type) {
    case 'Association':
      return rel.attrs?.isDirected ? { markerEndId: 'arrowOpen' } : {};
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
      return { markerEndId: 'arrowOpen', dasharray: '2 4', midLabel: influenceStrength || '±' };
    default:
      return { markerEndId: 'arrowOpen' };
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function nodeSize(n: ViewNodeLayout): { w: number; h: number } {
  const w = n.width ?? (n.connectorId ? 24 : 120);
  const h = n.height ?? (n.connectorId ? 24 : 60);
  return { w, h };
}

function nodeCenter(n: ViewNodeLayout): Point {
  const { w, h } = nodeSize(n);
  return { x: n.x + w / 2, y: n.y + h / 2 };
}

function nodeRect(n: ViewNodeLayout): { x: number; y: number; w: number; h: number } {
  const { w, h } = nodeSize(n);
  return { x: n.x, y: n.y, w, h };
}

export function createViewSvg(model: Model, viewId: string): string {
  const view = model.views[viewId];
  if (!view) throw new Error(`View not found: ${viewId}`);

  const nodes0 = view.layout?.nodes ?? [];
  const orderedNodes = [...nodes0]
    .filter((n) => Boolean(n.elementId || n.connectorId))
    .sort((a, b) => {
      const za = typeof (a as any).zIndex === 'number' ? (a as any).zIndex : 0;
      const zb = typeof (b as any).zIndex === 'number' ? (b as any).zIndex : 0;
      const ka = a.elementId ?? a.connectorId ?? '';
      const kb = b.elementId ?? b.connectorId ?? '';
      return za - zb || ka.localeCompare(kb);
    });

  const padding = 20;
  const b = boundsForNodes(
    orderedNodes.map((n) => {
      const { w, h } = nodeSize(n);
      return { ...n, width: w, height: h };
    })
  );

  // Minimum size for empty views.
  const width = Math.max(640, b.maxX - b.minX + padding * 2);
  const height = Math.max(420, b.maxY - b.minY + padding * 2);
  const offsetX = -b.minX + padding;
  const offsetY = -b.minY + padding;

  // Apply export offset to all nodes.
  const nodes: ViewNodeLayout[] = orderedNodes.map((n) => ({
    ...n,
    x: n.x + offsetX,
    y: n.y + offsetY,
    width: nodeSize(n).w,
    height: nodeSize(n).h,
  }));

  const nodeByKey = new Map<string, ViewNodeLayout>();
  for (const n of nodes) {
    const r = nodeRefFromLayout(n);
    if (!r) continue;
    nodeByKey.set(refKey(r), n);
  }

  type RelItem = {
    id: string;
    relId: string;
    points: Point[];
    label: string;
    visual: RelationshipVisual;
  };

  // Group connections by unordered endpoint pair so parallel relationships are offset consistently.
  const visibleConnections: ViewConnection[] = (view.connections ?? []).filter((c) => {
    const sKey = refKey({ kind: c.source.kind, id: c.source.id });
    const tKey = refKey({ kind: c.target.kind, id: c.target.id });
    return Boolean(nodeByKey.get(sKey) && nodeByKey.get(tKey) && model.relationships[c.relationshipId]);
  });

  const groups = new Map<string, ViewConnection[]>();
  for (const c of visibleConnections) {
    const a = refKey({ kind: c.source.kind, id: c.source.id });
    const bKey = refKey({ kind: c.target.kind, id: c.target.id });
    const groupKey = [a, bKey].sort().join('|');
    const arr = groups.get(groupKey) ?? [];
    arr.push(c);
    groups.set(groupKey, arr);
  }

  const relItems: RelItem[] = [];
  for (const [groupKey, conns] of groups) {
    // Stable order inside group.
    const sorted = [...conns].sort((a, b) => a.relationshipId.localeCompare(b.relationshipId) || a.id.localeCompare(b.id));
    const total = sorted.length;

    const parts = groupKey.split('|');
    const aNode = nodeByKey.get(parts[0]);
    const bNode = nodeByKey.get(parts[1]);
    const aC = aNode ? nodeCenter(aNode) : null;
    const bC = bNode ? nodeCenter(bNode) : null;

    for (let i = 0; i < sorted.length; i += 1) {
      const conn = sorted[i];
      const rel = model.relationships[conn.relationshipId];
      if (!rel) continue;

      const sNode = nodeByKey.get(refKey({ kind: conn.source.kind, id: conn.source.id }));
      const tNode = nodeByKey.get(refKey({ kind: conn.target.kind, id: conn.target.id }));
      if (!sNode || !tNode) continue;

      const sc = nodeCenter(sNode);
      const tc = nodeCenter(tNode);

      // Prefer border anchors (like in the canvas).
      const start = rectEdgeAnchor(sNode, tc);
      const end = rectEdgeAnchor(tNode, sc);

      // Translate any stored bendpoints.
      const translatedPoints = conn.points ? conn.points.map((p) => ({ x: p.x + offsetX, y: p.y + offsetY })) : undefined;

      // Centralized routing (straight/orthogonal) using the shared path generator.
      const sKey = refKey({ kind: conn.source.kind, id: conn.source.id });
      const tKey = refKey({ kind: conn.target.kind, id: conn.target.id });
      const obstacles = nodes
        .filter((n) => {
          const r = nodeRefFromLayout(n);
          if (!r) return false;
          const k = refKey(r);
          return k !== sKey && k !== tKey;
        })
        .map(nodeRect);

      const gridSize = view.formatting?.gridSize;
      const hints = {
        ...orthogonalRoutingHintsFromAnchors(sNode, start, tNode, end, gridSize),
        obstacles,
        obstacleMargin: gridSize ? gridSize / 2 : 10,
      };
      let points = getConnectionPath({ route: conn.route, points: translatedPoints }, { a: start, b: end, hints }).points;

      // Parallel relationship offset.
      if (total > 1) {
        const spacing = 14;
        const offsetIndex = i - (total - 1) / 2;
        const offset = offsetIndex * spacing;
        const perp = aC && bC ? unitPerp(aC, bC) : unitPerp(sc, tc);
        points = offsetPolyline(points, perp, offset);
      }

      const visual = relationshipVisual(rel);
      relItems.push({ id: conn.id, relId: conn.relationshipId, points, label: rel.type, visual });
    }
  }

  // Apply cheap lane offsets across all relationships before emitting SVG paths.
  const laneAdjusted = applyLaneOffsets(
    relItems.map((it) => ({ id: it.id, points: it.points })),
    { gridSize: view.formatting?.gridSize }
  );
  const lanePointsById = new Map<string, Point[]>();
  for (const it of laneAdjusted) lanePointsById.set(it.id, it.points);

  const linesSvg = relItems
    .map((it) => {
      const points = lanePointsById.get(it.id) ?? it.points;
      const d = polylineToSvgPath(points);
      const mid = polylineMidPoint(points);
      const markerStart = it.visual.markerStartId ? ` marker-start="url(#${it.visual.markerStartId})"` : '';
      const markerEnd = it.visual.markerEndId ? ` marker-end="url(#${it.visual.markerEndId})"` : '';
      const dash = it.visual.dasharray ? ` stroke-dasharray="${it.visual.dasharray}"` : '';
      const midLabel = it.visual.midLabel
        ? `<text x="${mid.x}" y="${mid.y - 6}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="12" font-weight="800" fill="rgba(0,0,0,0.65)" text-anchor="middle">${escapeXml(
            it.visual.midLabel
          )}</text>`
        : '';

      // Keep the type label in exports (helps interpretation if arrow styles are unfamiliar).
      // If we also render a midLabel, push the type label down a bit to avoid overlap.
      const labelY = it.visual.midLabel ? mid.y + 10 : mid.y - 4;
      const label = `<text x="${mid.x}" y="${labelY}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="11" fill="#334155" text-anchor="middle">${escapeXml(
        it.label
      )}</text>`;

      return [
        `<path d="${d}" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="2"${dash}${markerStart}${markerEnd} />`,
        midLabel,
        label,
      ].join('');
    })
    .join('');

  const nodesSvg = nodes
    .map((n) => {
      const x = n.x;
      const y = n.y;
      const { w, h } = nodeSize(n);

      if (n.connectorId) {
        const c = model.connectors?.[n.connectorId];
        const cx = x + w / 2;
        const cy = y + h / 2;
        const r = Math.min(w, h) / 2;
        const symbol = c?.type === 'OrJunction' ? '∨' : '∧';

        return `
          <g>
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff" stroke="#475569" stroke-width="2" />
            <text x="${cx}" y="${cy + 4}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="14" font-weight="800" fill="#0f172a" text-anchor="middle">${symbol}</text>
          </g>
        `;
      }

      const el = n.elementId ? model.elements[n.elementId] : null;
      if (!el) return '';

      const name = el.name || '(unnamed)';
      const type = el.type;
      const layer = (ELEMENT_TYPE_TO_LAYER[el.type] ?? 'Business') as ArchimateLayer;
      const fill = LAYER_FILL[layer];
      const tag = n.styleTag;
      const highlight = n.highlighted;

      const tagSvg = tag
        ? `<g>
            <rect x="${x + 8}" y="${y + h - 22}" width="${Math.max(28, tag.length * 7)}" height="16" rx="8" fill="#e2e8f0" />
            <text x="${x + 14}" y="${y + h - 10}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="11" fill="#0f172a">${escapeXml(tag)}</text>
          </g>`
        : '';

      return `
        <g>
          <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${fill}" stroke="${highlight ? '#f59e0b' : '#cbd5e1'}" stroke-width="${highlight ? 2 : 1}" />
          <text x="${x + 10}" y="${y + 22}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="13" font-weight="700" fill="#0f172a">${escapeXml(name)}</text>
          <text x="${x + 10}" y="${y + 40}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="12" fill="#334155">${escapeXml(type)}</text>
          ${tagSvg}
        </g>
      `;
    })
    .join('');

  // Export uses a neutral light background so diagrams remain readable when
  // embedded in documents regardless of the app's current theme.
  const backgroundFill = '#ffffff';

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
  <rect x="0" y="0" width="${width}" height="${height}" fill="${backgroundFill}" />
  <text x="${padding}" y="${padding}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="14" font-weight="700" fill="#0f172a">${title}</text>
  <g transform="translate(0, 12)">
    ${linesSvg}
    ${nodesSvg}
  </g>
</svg>`;

  return svg;
}

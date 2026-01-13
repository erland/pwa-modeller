import type { Model, ViewNodeLayout, ArchimateLayer, ElementType, ViewConnection, RelationshipType } from '../../domain';
import { ELEMENT_TYPES_BY_LAYER } from '../../domain';
import { RELATIONSHIP_TYPES } from '../../domain/config/catalog';
import { refKey } from './connectable';
import { getConnectionPath, polylineToSvgPath } from './connectionPath';
import { applyLaneOffsetsSafely } from './connectionLanes';
import { orthogonalRoutingHintsFromAnchors } from './orthogonalHints';
import { adjustOrthogonalConnectionEndpoints } from './adjustConnectionEndpoints';
import {
  boundsForNodes,
  nodeRefFromLayout,
  offsetPolyline,
  polylineMidPoint,
  rectAlignedOrthogonalAnchors,
  unitPerp,
  type Point,
} from './geometry';
import { archimateRelationshipStyle } from '../../diagram/relationships/archimateStyle';
import { dasharrayForPattern } from '../../diagram/relationships/style';
import { markerId, renderSvgMarkerDefs } from '../../diagram/relationships/markers';

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
  midLabel?: string;
};

const RELATIONSHIP_TYPE_SET: ReadonlySet<string> = new Set(RELATIONSHIP_TYPES);

function isRelationshipType(t: string): t is RelationshipType {
  return RELATIONSHIP_TYPE_SET.has(t);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function pickArchimateAttrs(attrs: unknown): { isDirected?: boolean; accessType?: string; influenceStrength?: string } | undefined {
  if (!isRecord(attrs)) return undefined;
  const out: { isDirected?: boolean; accessType?: string; influenceStrength?: string } = {};

  if (typeof attrs.isDirected === 'boolean') out.isDirected = attrs.isDirected;
  if (typeof attrs.accessType === 'string') out.accessType = attrs.accessType;
  if (typeof attrs.influenceStrength === 'string') out.influenceStrength = attrs.influenceStrength;

  return Object.keys(out).length ? out : undefined;
}

function relationshipVisual(rel: { type: string; attrs?: unknown }): RelationshipVisual {
  // Export currently supports ArchiMate visuals; as UML/BPMN are added,
  // export will switch based on view.kind via the notation registry.
  const style = isRelationshipType(rel.type)
    ? archimateRelationshipStyle({ type: rel.type, attrs: pickArchimateAttrs(rel.attrs) })
    : { markerEnd: 'arrowOpen' as const };
  const dasharray = style.line?.dasharray ?? dasharrayForPattern(style.line?.pattern);
  return {
    markerStartId: markerId(style.markerStart, false),
    markerEndId: markerId(style.markerEnd, false),
    dasharray,
    midLabel: style.midLabel,
  };
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
      const za = typeof a.zIndex === 'number' ? a.zIndex : 0;
      const zb = typeof b.zIndex === 'number' ? b.zIndex : 0;
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
  const obstaclesById = new Map<string, Array<{ x: number; y: number; w: number; h: number }>>();
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
      const { start, end } = rectAlignedOrthogonalAnchors(sNode, tNode);

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

      obstaclesById.set(conn.id, obstacles);

      const gridSize = view.formatting?.gridSize;
      const hints = {
        ...orthogonalRoutingHintsFromAnchors(sNode, start, tNode, end, gridSize),
        obstacles,
        obstacleMargin: gridSize ? gridSize / 2 : 10,
      };
      let points = getConnectionPath({ route: conn.route, points: translatedPoints }, { a: start, b: end, hints }).points;

      if (conn.route.kind === 'orthogonal') {
        points = adjustOrthogonalConnectionEndpoints(points, sNode, tNode, { stubLength: gridSize ? gridSize / 2 : 10 });
      }

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
  const laneAdjusted = applyLaneOffsetsSafely(
    relItems.map((it) => ({ id: it.id, points: it.points })),
    {
      gridSize: view.formatting?.gridSize,
      obstaclesById,
      obstacleMargin: view.formatting?.gridSize ? view.formatting?.gridSize / 2 : 10,
    }
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
    ${renderSvgMarkerDefs({ stroke: 'rgba(0,0,0,0.55)' })}
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

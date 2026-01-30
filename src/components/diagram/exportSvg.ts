import type { Model, ViewNodeLayout, ArchimateLayer, ElementType, ViewConnection } from '../../domain';
import { ELEMENT_TYPES_BY_LAYER, getElementTypeLabel, getRelationshipTypeLabel } from '../../domain';
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
  rectAlignedOrthogonalAnchorsWithEndpointAnchors,
  unitPerp,
  type Point,
} from './geometry';
import { dasharrayForPattern } from '../../diagram/relationships/style';
import { markerId, renderSvgMarkerDefs } from '../../diagram/relationships/markers';
import { getNotation } from '../../notations';

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

function relationshipVisual(
  rel: { type: string; attrs?: unknown },
  viewKind: 'archimate' | 'uml' | 'bpmn'
): RelationshipVisual {
  // Use the notation registry for styling so exports stay consistent as new notations are added.
  const notation = getNotation(viewKind);

  // ArchiMate expects specific attrs; normalize for better compatibility when exporting.
  const normalizedRel = viewKind === 'archimate' ? { ...rel, attrs: pickArchimateAttrs(rel.attrs) } : rel;

  const style = notation.getRelationshipStyle(normalizedRel);
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
  const isObj = Boolean(n.objectId);
  const w = n.width ?? (n.connectorId ? 24 : isObj ? 200 : 120);
  const h = n.height ?? (n.connectorId ? 24 : isObj ? 120 : 60);
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
    .filter((n) => Boolean(n.elementId || n.connectorId || n.objectId))
    .sort((a, b) => {
      const za = typeof a.zIndex === 'number' ? a.zIndex : 0;
      const zb = typeof b.zIndex === 'number' ? b.zIndex : 0;
      const ka = a.elementId ?? a.connectorId ?? a.objectId ?? '';
      const kb = b.elementId ?? b.connectorId ?? b.objectId ?? '';
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
      const { start, end } = rectAlignedOrthogonalAnchorsWithEndpointAnchors(sNode, tNode, conn.sourceAnchor, conn.targetAnchor);

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

      const visual = relationshipVisual(rel, (view.kind ?? 'archimate') as 'archimate' | 'uml' | 'bpmn');
      relItems.push({ id: conn.id, relId: conn.relationshipId, points, label: getRelationshipTypeLabel(rel.type), visual });
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

  const isContainerType = (typeId: string): boolean => typeId === 'bpmn.pool' || typeId === 'bpmn.lane';
  const isObjectType = (t: unknown): t is 'Note' | 'Label' | 'GroupBox' | 'Divider' =>
    t === 'Note' || t === 'Label' || t === 'GroupBox' || t === 'Divider';

  const objectText = (t: string, obj: { name?: string; text?: string }): string => {
    if (t === 'GroupBox') return obj.name?.trim() || 'Group';
    if (t === 'Divider') return '';
    const raw = obj.text?.trim();
    if (raw) return raw;
    return t === 'Label' ? 'Label' : 'Note';
  };

  const svgTextAnchor = (align: unknown): 'start' | 'middle' | 'end' => {
    if (align === 'center') return 'middle';
    if (align === 'right') return 'end';
    return 'start';
  };

  const renderMultilineText = (x: number, y: number, text: string, opts: { fontSize: number; fontWeight?: number; fill: string; anchor: 'start' | 'middle' | 'end' }): string => {
    const lines = text.split(/\r?\n/);
    const lh = Math.round(opts.fontSize * 1.25);
    return `<text x="${x}" y="${y}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="${opts.fontSize}"${
      opts.fontWeight ? ` font-weight="${opts.fontWeight}"` : ''
    } fill="${opts.fill}" text-anchor="${opts.anchor}">${lines
      .map((ln, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : lh}">${escapeXml(ln)}</tspan>`)
      .join('')}</text>`;
  };

  const renderNodeSvg = (n: ViewNodeLayout): string => {
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

    // View-local objects (note/label/group box/divider).
    if (n.objectId) {
      const obj = view.objects?.[n.objectId];
      if (!obj || !isObjectType(obj.type)) return '';

      const isGroup = obj.type === 'GroupBox';
      const isDivider = obj.type === 'Divider';
      const isDividerVertical = isDivider && h > w;
      const isLabel = obj.type === 'Label';
      const isNote = obj.type === 'Note';

      const stroke = (obj.style?.stroke as string | undefined) ?? (n.highlighted ? '#f59e0b' : 'rgba(0,0,0,0.18)');
      const fill = (obj.style?.fill as string | undefined) ?? (isNote ? 'rgba(255, 255, 200, 0.92)' : isGroup || isLabel || isDivider ? 'transparent' : 'rgba(255,255,255,0.92)');
      const dash = isGroup || isLabel ? ' stroke-dasharray="6 6"' : '';
      const strokeWidth = isGroup ? 2 : isDivider ? 0 : 1;
      const rx = isDivider ? 0 : 12;

      if (isDivider) {
        const lineStroke = (obj.style?.stroke as string | undefined) ?? 'rgba(0,0,0,0.55)';
        const x1 = isDividerVertical ? x + w / 2 : x;
        const y1 = isDividerVertical ? y : y + h / 2;
        const x2 = isDividerVertical ? x + w / 2 : x + w;
        const y2 = isDividerVertical ? y + h : y + h / 2;
        return `<g>
          <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${lineStroke}" stroke-width="2" />
        </g>`;
      }

      const text = objectText(obj.type, obj);
      const textAlign = svgTextAnchor(obj.style?.textAlign);
      const padX = isLabel ? 6 : 10;
      const padY = isLabel ? 14 : isGroup ? 18 : 18;
      const tx = textAlign === 'middle' ? x + w / 2 : textAlign === 'end' ? x + w - padX : x + padX;

      const rect = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash} />`;

      if (isGroup) {
        return `<g>
          ${rect}
          ${renderMultilineText(tx, y + padY, text, { fontSize: 12, fontWeight: 800, fill: 'rgba(0,0,0,0.88)', anchor: textAlign })}
        </g>`;
      }

      if (isLabel) {
        return `<g>
          ${rect}
          ${renderMultilineText(tx, y + padY, text, { fontSize: 13, fill: 'rgba(0,0,0,0.88)', anchor: textAlign })}
        </g>`;
      }

      if (isNote) {
        return `<g>
          ${rect}
          ${renderMultilineText(tx, y + padY, text, { fontSize: 13, fill: 'rgba(0,0,0,0.88)', anchor: textAlign })}
        </g>`;
      }

      // Default fallback.
      return `<g>
        ${rect}
        ${renderMultilineText(tx, y + padY, text, { fontSize: 13, fill: 'rgba(0,0,0,0.88)', anchor: textAlign })}
      </g>`;
    }

    const el = n.elementId ? model.elements[n.elementId] : null;
    if (!el) return '';

    const name = el.name || '(unnamed)';
    const type = el.type;
    const typeLabel = getElementTypeLabel(type);

    const layer = (ELEMENT_TYPE_TO_LAYER[type] ?? 'Business') as ArchimateLayer;
    const fill = LAYER_FILL[layer];
    const tag = n.styleTag;
    const highlight = n.highlighted;

    // Use higher-contrast strokes in SVG exports so borders remain visible even when nodes are nested.
    const stroke = highlight ? '#f59e0b' : '#475569';
    const strokeWidth = 2;

    const tagSvg = tag
      ? `<g>
          <rect x="${x + 8}" y="${y + h - 22}" width="${Math.max(28, tag.length * 7)}" height="16" rx="8" fill="#e2e8f0" />
          <text x="${x + 14}" y="${y + h - 10}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="11" fill="#0f172a">${escapeXml(tag)}</text>
        </g>`
      : '';

    return `
      <g>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />
        <text x="${x + 10}" y="${y + 22}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="13" font-weight="700" fill="#0f172a">${escapeXml(name)}</text>
        <text x="${x + 10}" y="${y + 40}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="12" fill="#334155">${escapeXml(typeLabel)}</text>
        ${tagSvg}
      </g>
    `;
  };

  // If we have container nodes (e.g. BPMN pools/lanes), render them *behind* relationships
  // so edges remain visible when drawn inside containers.
  const containerNodes = nodes.filter((n) => {
    if (!n.elementId) return false;
    const el = model.elements[n.elementId];
    return Boolean(el && isContainerType(el.type));
  });

  const groupBoxNodes = nodes.filter((n) => {
    if (!n.objectId) return false;
    const obj = view.objects?.[n.objectId];
    return Boolean(obj && obj.type === 'GroupBox');
  });

  const foregroundNodes = nodes.filter((n) => {
    if (n.connectorId) return true;
    if (!n.elementId) return false;
    const el = model.elements[n.elementId];
    return Boolean(el && !isContainerType(el.type));
  });

  const foregroundObjectNodes = nodes.filter((n) => {
    if (!n.objectId) return false;
    const obj = view.objects?.[n.objectId];
    return Boolean(obj && obj.type !== 'GroupBox');
  });

  const containersSvg = [...containerNodes, ...groupBoxNodes].map(renderNodeSvg).join('');
  const nodesSvg = [...foregroundNodes, ...foregroundObjectNodes].map(renderNodeSvg).join('');

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
    ${containersSvg}
    ${linesSvg}
    ${nodesSvg}
  </g>
</svg>`;

  return svg;
}
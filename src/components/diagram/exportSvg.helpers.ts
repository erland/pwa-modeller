import type { Model, ViewNodeLayout, ViewConnection } from '../../domain';
import { getRelationshipTypeLabel } from '../../domain';
import { dasharrayForPattern } from '../../diagram/relationships/style';
import { markerId } from '../../diagram/relationships/markers';
import { getNotation } from '../../notations';

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

export type RelationshipVisual = {
  markerStartId?: string;
  markerEndId?: string;
  dasharray?: string;
  midLabel?: string;
};

export type RelItem = {
  id: string;
  relId: string;
  points: Point[];
  label: string;
  visual: RelationshipVisual;
};

export type Viewport = { width: number; height: number; offsetX: number; offsetY: number };

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

export function relationshipVisual(rel: { type: string; attrs?: unknown }, viewKind: 'archimate' | 'uml' | 'bpmn'): RelationshipVisual {
  const notation = getNotation(viewKind);
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

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function nodeSize(n: ViewNodeLayout): { w: number; h: number } {
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

export function getOrderedNodes(layoutNodes: ViewNodeLayout[]): ViewNodeLayout[] {
  const nodes = layoutNodes.slice();
  const out: ViewNodeLayout[] = [];
  for (const n of nodes) {
    if (n.elementId || n.connectorId || n.objectId) out.push(n);
  }
  out.sort((a, b) => {
    const za = typeof a.zIndex === 'number' ? a.zIndex : 0;
    const zb = typeof b.zIndex === 'number' ? b.zIndex : 0;
    const ka = a.elementId ?? a.connectorId ?? a.objectId ?? '';
    const kb = b.elementId ?? b.connectorId ?? b.objectId ?? '';
    return za - zb || ka.localeCompare(kb);
  });
  return out;
}

export function computeViewport(orderedNodes: ViewNodeLayout[], padding: number): Viewport {
  const sized: Array<ViewNodeLayout & { width: number; height: number }> = [];
  for (const n of orderedNodes) {
    const { w, h } = nodeSize(n);
    sized.push({ ...n, width: w, height: h });
  }
  const b = boundsForNodes(sized);
  const width = Math.max(640, b.maxX - b.minX + padding * 2);
  const height = Math.max(420, b.maxY - b.minY + padding * 2);
  const offsetX = -b.minX + padding;
  const offsetY = -b.minY + padding;
  return { width, height, offsetX, offsetY };
}

export function translateNodes(orderedNodes: ViewNodeLayout[], viewport: Pick<Viewport, 'offsetX' | 'offsetY'>): ViewNodeLayout[] {
  const out: ViewNodeLayout[] = [];
  for (const n of orderedNodes) {
    const { w, h } = nodeSize(n);
    out.push({ ...n, x: n.x + viewport.offsetX, y: n.y + viewport.offsetY, width: w, height: h });
  }
  return out;
}

export function buildNodeIndex(nodes: ViewNodeLayout[]): Map<string, ViewNodeLayout> {
  const nodeByKey = new Map<string, ViewNodeLayout>();
  for (const n of nodes) {
    const r = nodeRefFromLayout(n);
    if (!r) continue;
    nodeByKey.set(refKey(r), n);
  }
  return nodeByKey;
}

export function computeRelationshipItems(args: {
  model: Model;
  view: { kind?: 'archimate' | 'uml' | 'bpmn'; connections?: ViewConnection[]; formatting?: { gridSize?: number } };
  nodes: ViewNodeLayout[];
  nodeByKey: Map<string, ViewNodeLayout>;
  viewport: Pick<Viewport, 'offsetX' | 'offsetY'>;
}): { relItems: RelItem[]; obstaclesById: Map<string, Array<{ x: number; y: number; w: number; h: number }>> } {
  const { model, view, nodes, nodeByKey, viewport } = args;
  const kind = (view.kind ?? 'archimate') as 'archimate' | 'uml' | 'bpmn';

  const visibleConnections: ViewConnection[] = [];
  for (const c of view.connections ?? []) {
    const sKey = refKey({ kind: c.source.kind, id: c.source.id });
    const tKey = refKey({ kind: c.target.kind, id: c.target.id });
    if (nodeByKey.get(sKey) && nodeByKey.get(tKey) && model.relationships[c.relationshipId]) visibleConnections.push(c);
  }

  const groups = new Map<string, ViewConnection[]>();
  for (const c of visibleConnections) {
    const a = refKey({ kind: c.source.kind, id: c.source.id });
    const b = refKey({ kind: c.target.kind, id: c.target.id });
    const pair = [a, b];
    pair.sort();
    const groupKey = `${pair[0]}|${pair[1]}`;
    const arr = groups.get(groupKey);
    if (arr) arr.push(c);
    else groups.set(groupKey, [c]);
  }

  const relItems: RelItem[] = [];
  const obstaclesById = new Map<string, Array<{ x: number; y: number; w: number; h: number }>>();

  for (const [groupKey, conns] of groups) {
    const sorted = conns.slice();
    sorted.sort((a, b) => a.relationshipId.localeCompare(b.relationshipId) || a.id.localeCompare(b.id));
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
      const { start, end } = rectAlignedOrthogonalAnchorsWithEndpointAnchors(sNode, tNode, conn.sourceAnchor, conn.targetAnchor);

      const translatedPoints = conn.points
        ? conn.points.map((p) => ({ x: p.x + viewport.offsetX, y: p.y + viewport.offsetY }))
        : undefined;

      const sKey = refKey({ kind: conn.source.kind, id: conn.source.id });
      const tKey = refKey({ kind: conn.target.kind, id: conn.target.id });
      const isSelf = sKey === tKey;
      const obstacles: Array<{ x: number; y: number; w: number; h: number }> = [];
      for (const n of nodes) {
        const r = nodeRefFromLayout(n);
        if (!r) continue;
        const k = refKey(r);
        if (k === sKey || k === tKey) continue;
        obstacles.push(nodeRect(n));
      }
      obstaclesById.set(conn.id, obstacles);

      const selfBounds = isSelf ? nodeRect(sNode) : undefined;

      const gridSize = view.formatting?.gridSize;
      const hints = {
        ...orthogonalRoutingHintsFromAnchors(sNode, start, tNode, end, gridSize),
        obstacles,
        obstacleMargin: gridSize ? gridSize / 2 : 10,
        selfLoop: isSelf,
        selfBounds,
      };

      let points = getConnectionPath({ route: conn.route, points: translatedPoints }, { a: start, b: end, hints }).points;
      if (conn.route.kind === 'orthogonal') {
        points = adjustOrthogonalConnectionEndpoints(points, sNode, tNode, { stubLength: gridSize ? gridSize / 2 : 10 });
      }

      if (total > 1) {
        const spacing = 14;
        const offsetIndex = i - (total - 1) / 2;
        const offset = offsetIndex * spacing;
        const perp = aC && bC ? unitPerp(aC, bC) : unitPerp(sc, tc);
        points = offsetPolyline(points, perp, offset);
      }

      const visual = relationshipVisual(rel, kind);
      relItems.push({ id: conn.id, relId: conn.relationshipId, points, label: getRelationshipTypeLabel(rel.type), visual });
    }
  }

  return { relItems, obstaclesById };
}

export function applyLaneOffsetsForExport(args: {
  relItems: RelItem[];
  view: { formatting?: { gridSize?: number } };
  obstaclesById: Map<string, Array<{ x: number; y: number; w: number; h: number }>>;
}): Map<string, Point[]> {
  const { relItems, view, obstaclesById } = args;
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
  return lanePointsById;
}

export function renderLinesSvg(relItems: RelItem[], lanePointsById: Map<string, Point[]>): string {
  const out: string[] = [];
  for (const it of relItems) {
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

    const labelY = it.visual.midLabel ? mid.y + 10 : mid.y - 4;
    const label = `<text x="${mid.x}" y="${labelY}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="11" fill="#334155" text-anchor="middle">${escapeXml(
      it.label
    )}</text>`;

    out.push(
      [
        `<path d="${d}" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="2"${dash}${markerStart}${markerEnd} />`,
        midLabel,
        label,
      ].join('')
    );
  }
  return out.join('');
}

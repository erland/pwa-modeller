import { useMemo } from 'react';
import type { Model, ViewConnection, ViewNodeLayout } from '../../../domain';
import type { Notation } from '../../../notations';
import type { Selection } from '../../model/selection';
import { RelationshipMarkers } from '../RelationshipMarkers';
import type { DiagramLinkDrag } from '../DiagramNode';
import type { GroupBoxDraft } from '../hooks/useDiagramToolState';
import type { Point } from '../geometry';
import {
  nodeRefFromLayout,
  offsetPolyline,
  polylineMidPoint,
  rectAlignedOrthogonalAnchorsWithEndpointAnchors,
  unitPerp,
} from '../geometry';
import { getConnectionPath } from '../connectionPath';
import { applyLaneOffsetsSafely } from '../connectionLanes';
import { orthogonalRoutingHintsFromAnchors } from '../orthogonalHints';
import { adjustOrthogonalConnectionEndpoints } from '../adjustConnectionEndpoints';
import { refKey } from '../connectable';
import { markerUrl } from '../../../diagram/relationships/markers';
import { dasharrayForPattern } from '../../../diagram/relationships/style';

export type ConnectionRenderItem = {
  connection: ViewConnection;
  source: ViewNodeLayout;
  target: ViewNodeLayout;
  indexInGroup: number;
  totalInGroup: number;
  groupKey: string;
};

type Props = {
  model: Model;
  notation: Notation;
  /** Active view id (used for per-view connection properties like routing). */
  viewId?: string;
  /** Grid size used when choosing routing channels for orthogonal connections. */
  gridSize?: number;
  /** Current zoom factor. Used to hide small labels when zoomed out. */
  zoom: number;
  /** Whether to show UML multiplicity end labels (view setting). Defaults to true. */
  showMultiplicities?: boolean;

  nodes: ViewNodeLayout[];
  connectionRenderItems: ConnectionRenderItem[];
  surfaceWidthModel: number;
  surfaceHeightModel: number;
  selection: Selection;
  linkDrag: DiagramLinkDrag | null;
  groupBoxDraft: GroupBoxDraft | null;
  onSelect: (sel: Selection) => void;
};


type Side = 'L' | 'R' | 'T' | 'B';

function sideOf(rect: { x: number; y: number; w: number; h: number }, p: Point): Side {
  const dl = Math.abs(p.x - rect.x);
  const dr = Math.abs(p.x - (rect.x + rect.w));
  const dt = Math.abs(p.y - rect.y);
  const db = Math.abs(p.y - (rect.y + rect.h));
  const m = Math.min(dl, dr, dt, db);
  if (m === dl) return 'L';
  if (m === dr) return 'R';
  if (m === dt) return 'T';
  return 'B';
}

function pointInRect(p: Point, r: { x: number; y: number; w: number; h: number }): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

function segIntersectsSeg(a: Point, b: Point, c: Point, d: Point): boolean {
  const orient = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const onSeg = (p: Point, q: Point, r: Point) =>
    Math.min(p.x, r.x) <= q.x && q.x <= Math.max(p.x, r.x) && Math.min(p.y, r.y) <= q.y && q.y <= Math.max(p.y, r.y);

  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);

  if (o1 === 0 && onSeg(a, c, b)) return true;
  if (o2 === 0 && onSeg(a, d, b)) return true;
  if (o3 === 0 && onSeg(c, a, d)) return true;
  if (o4 === 0 && onSeg(c, b, d)) return true;

  return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
}

function segmentIntersectsRect(
  a: Point,
  b: Point,
  rect: { x: number; y: number; w: number; h: number },
  padding: number
): boolean {
  const r = { x: rect.x - padding, y: rect.y - padding, w: rect.w + padding * 2, h: rect.h + padding * 2 };
  if (pointInRect(a, r) || pointInRect(b, r)) return true;

  const tl: Point = { x: r.x, y: r.y };
  const tr: Point = { x: r.x + r.w, y: r.y };
  const br: Point = { x: r.x + r.w, y: r.y + r.h };
  const bl: Point = { x: r.x, y: r.y + r.h };

  const minx = Math.min(a.x, b.x);
  const maxx = Math.max(a.x, b.x);
  const miny = Math.min(a.y, b.y);
  const maxy = Math.max(a.y, b.y);
  if (maxx < r.x || minx > r.x + r.w || maxy < r.y || miny > r.y + r.h) return false;

  return (
    segIntersectsSeg(a, b, tl, tr) ||
    segIntersectsSeg(a, b, tr, br) ||
    segIntersectsSeg(a, b, br, bl) ||
    segIntersectsSeg(a, b, bl, tl)
  );
}

function estimateTextBBox(center: Point, text: string): { x: number; y: number; w: number; h: number } {
  const w = Math.max(10, text.length * 7);
  const h = 14;
  return { x: center.x - w / 2, y: center.y - h / 2, w, h };
}

function rectIntersectsRect(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

function placeMultiplicityLabel(args: {
  points: Point[];
  which: 'source' | 'target';
  text: string;
  avoidSegments: Array<{ a: Point; b: Point }>;
  nodeRect: { x: number; y: number; w: number; h: number };
  hasDiamondMarker: boolean;
  baseExtraPerpOffset: number;
  // Kept for call-site compatibility; ignored by this placement strategy.
  preferredSign: 1 | -1;
  /** Number of multiplicity-bearing relationship-ends that share the same (node, side) group. */
  crowdCount?: number;
}): { x: number; y: number; dy: number } | null {
  const { points, which, text, avoidSegments, nodeRect, hasDiamondMarker } = args;
  const crowdCount = args.crowdCount ?? 1;
  if (points.length < 2) return null;

  const endPt = which === 'source' ? points[0] : points[points.length - 1];
  // Note: we intentionally don't use the first routed segment direction here (see comment below).

  // Determine which side of the node we are attached to.
  // IMPORTANT: Do NOT rely on the first routed segment direction (nextPt-endPt)
  // since orthogonal routing may first travel sideways along the node border.
  // We want a stable anchor that is guaranteed to be OUTSIDE the node.
  const side = sideOf(nodeRect, endPt);
  const outward: Point =
    side === 'T'
      ? { x: 0, y: -1 }
      : side === 'B'
        ? { x: 0, y: 1 }
        : side === 'L'
          ? { x: -1, y: 0 }
          : { x: 1, y: 0 }; // 'R'

  // Push label outward from endpoint/marker.
  // For LEFT/RIGHT anchors, the label bbox can otherwise still intersect the node even when
  // placed above/below the line (because x is only slightly outside the node). Compensate by
  // adding ~half the text width to the outward distance.
  const baseAlongOut = hasDiamondMarker ? 22 : 12;
  const approxTextW = estimateTextBBox({ x: 0, y: 0 }, text).w;
  const extraAlongOut = side === 'L' || side === 'R' ? Math.ceil(approxTextW / 2) + 2 : 0;
  const alongOut = baseAlongOut + extraAlongOut;
  const anchor: Point = { x: endPt.x + outward.x * alongOut, y: endPt.y + outward.y * alongOut };

  // Exclusion zone around marker/endpoint (avoid diamonds etc.)
  const markerR = hasDiamondMarker ? 14 : 6;
  const markerRect = { x: endPt.x - markerR, y: endPt.y - markerR, w: markerR * 2, h: markerR * 2 };

  // NOTE: side already computed above.

  // Candidate offset axis (screen-space), chosen to keep labels close and predictable:
  // - If edge enters TOP/BOTTOM: try LEFT, then RIGHT, else CENTER on the edge.
  // - If edge enters LEFT/RIGHT: try ABOVE, then BELOW, else CENTER on the edge.
  const primaryAxis: Point = side === 'T' || side === 'B' ? { x: -1, y: 0 } : { x: 0, y: -1 };
  const secondaryAxis: Point = side === 'T' || side === 'B' ? { x: 1, y: 0 } : { x: 0, y: 1 };

  // Distance from edge to label center. Keep tighter for plain ends, larger for diamonds.
  // In crowded situations, slightly increase to avoid sitting on top of a neighboring edge.
  const baseD = hasDiamondMarker ? 14 : 8;
  const d = baseD + (crowdCount > 1 ? 4 : 0);

  const pad = crowdCount > 1 ? 4 : 3;

  const isClean = (pos: Point): boolean => {
    const bbox = estimateTextBBox(pos, text);
    if (rectIntersectsRect(bbox, markerRect)) return false;
    if (rectIntersectsRect(bbox, nodeRect)) return false;
    for (const s of avoidSegments) {
      if (segmentIntersectsRect(s.a, s.b, bbox, pad)) return false;
    }
    return true;
  };

  // Try increasing distances while keeping the preferred ordering (primary then secondary).
  // This avoids the common failure mode where both candidates are "almost" clean but
  // still intersect a neighboring parallel relationship when edges are close together.
  const step = hasDiamondMarker ? 6 : 5;
  const maxK = hasDiamondMarker ? 5 : 6;
  for (let k = 0; k < maxK; k++) {
    const dd = d + k * step;
    const pos1: Point = { x: anchor.x + primaryAxis.x * dd, y: anchor.y + primaryAxis.y * dd };
    if (isClean(pos1)) return { x: pos1.x, y: pos1.y, dy: 0 };

    const pos2: Point = { x: anchor.x + secondaryAxis.x * dd, y: anchor.y + secondaryAxis.y * dd };
    if (isClean(pos2)) return { x: pos2.x, y: pos2.y, dy: 0 };
  }

  // Fallback: center on the relationship (keeps association obvious even when crowded).
  return { x: anchor.x, y: anchor.y, dy: 0 };
}

function normalizeMultiplicityLabel(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;
  // Always hide defaults
  if (s === '1' || s === '1..1') return null;
  return s;
}

// Note: end-label placement uses placeMultiplicityLabel (two-sided, collision-aware).

function shouldShowEndLabels(opts: { zoom: number; isSelected: boolean; hasAny: boolean }): boolean {
  if (!opts.hasAny) return false;
  // When zoomed out, show only for selected relationship to avoid clutter.
  if (opts.zoom < 0.9) return opts.isSelected;
  return true;
}
export function DiagramRelationshipsLayer({
  model,
  notation,
  viewId,
  gridSize,
  zoom,
  showMultiplicities = true,
  nodes,
  connectionRenderItems,
  surfaceWidthModel,
  surfaceHeightModel,
  selection,
  linkDrag,
  groupBoxDraft,
  onSelect,
}: Props) {
  const nodeRect = (n: ViewNodeLayout) => {
    const isConnector = Boolean(n.connectorId);
    const w = n.width ?? (isConnector ? 24 : 120);
    const h = n.height ?? (isConnector ? 24 : 60);
    return { x: n.x, y: n.y, w, h };
  };

  // Precompute routed polylines for all connections and apply cheap lane offsets for
  // connections that share a similar corridor (helps avoid visually merging lines).
  const pointsByConnectionId = useMemo(() => {
    const laneItems: Array<{ id: string; points: Point[] }> = [];
    const obstaclesById = new Map<string, Array<{ x: number; y: number; w: number; h: number }>>();

    for (const item of connectionRenderItems) {
      const conn = item.connection;
      const rel = model.relationships[conn.relationshipId];
      if (!rel) continue;

      const s = item.source;
      const t = item.target;
      const sc: Point = { x: s.x + (s.width ?? 120) / 2, y: s.y + (s.height ?? 60) / 2 };
      const tc: Point = { x: t.x + (t.width ?? 120) / 2, y: t.y + (t.height ?? 60) / 2 };
      const { start, end } = rectAlignedOrthogonalAnchorsWithEndpointAnchors(s, t, conn.sourceAnchor, conn.targetAnchor);

      const sKey = refKey(nodeRefFromLayout(s)!);
      const tKey = refKey(nodeRefFromLayout(t)!);
      const isSelf = sKey === tKey;
      const obstacles = nodes
        .filter((n) => {
          const r = nodeRefFromLayout(n);
          if (!r) return false;
          const k = refKey(r);
          return k !== sKey && k !== tKey;
        })
        .map(nodeRect);

      const selfBounds = isSelf ? nodeRect(s) : undefined;

      obstaclesById.set(conn.id, obstacles);

      const hints = {
        ...orthogonalRoutingHintsFromAnchors(s, start, t, end, gridSize),
        obstacles,
        obstacleMargin: gridSize ? gridSize / 2 : 10,
        selfLoop: isSelf,
        selfBounds,
      };
      let points: Point[] = getConnectionPath(conn, { a: start, b: end, hints }).points;

      // If the router decided to start/end with an axis that doesn't match the original anchors,
      // snap endpoints to the implied node edges so the connection doesn't appear to "start from"
      // an unexpected side (e.g. horizontal segment starting at the top edge).
      if (conn.route.kind === 'orthogonal') {
        points = adjustOrthogonalConnectionEndpoints(points, s, t, { stubLength: gridSize ? gridSize / 2 : 10 });
      }

      const total = item.totalInGroup;
      if (total > 1) {
        const spacing = 14;
        const offsetIndex = item.indexInGroup - (total - 1) / 2;
        const offset = offsetIndex * spacing;
        const parts = item.groupKey.split('|');
        const aNode = nodes.find((n) => {
          const r = nodeRefFromLayout(n);
          return r ? refKey(r) === parts[0] : false;
        });
        const bNode = nodes.find((n) => {
          const r = nodeRefFromLayout(n);
          return r ? refKey(r) === parts[1] : false;
        });
        const aC: Point | null = aNode ? { x: aNode.x + (aNode.width ?? 120) / 2, y: aNode.y + (aNode.height ?? 60) / 2 } : null;
        const bC: Point | null = bNode ? { x: bNode.x + (bNode.width ?? 120) / 2, y: bNode.y + (bNode.height ?? 60) / 2 } : null;
        const perp = aC && bC ? unitPerp(aC, bC) : unitPerp(sc, tc);
        points = offsetPolyline(points, perp, offset);
      }

      laneItems.push({ id: conn.id, points });
    }

    const adjusted = applyLaneOffsetsSafely(laneItems, {
      gridSize,
      obstaclesById,
      obstacleMargin: gridSize ? gridSize / 2 : 10,
    });
    const map = new Map<string, Point[]>();
    for (const it of adjusted) map.set(it.id, it.points);
    return map;
  }, [connectionRenderItems, model, nodes, gridSize]);

  // Option A: deterministic fan-out for UML multiplicity end labels.
  // Group connection-ends by (node, side) and stagger the perpendicular offset.
  const endLabelExtraPerpOffsetByConnEnd = useMemo(() => {
    const groups = new Map<string, Array<{ connId: string; end: 'source' | 'target'; angle: number }>>();

    for (const item of connectionRenderItems) {
      const conn = item.connection;
      const rel = model.relationships[conn.relationshipId];
      if (!rel) continue;

      const isAssocLike = rel.type === 'uml.association' || rel.type === 'uml.aggregation' || rel.type === 'uml.composition';
      if (!isAssocLike) continue;

      const sm = normalizeMultiplicityLabel((rel as any).attrs?.sourceMultiplicity);
      const tm = normalizeMultiplicityLabel((rel as any).attrs?.targetMultiplicity);
      if (!sm && !tm) continue;

      const pts = pointsByConnectionId.get(conn.id);
      if (!pts || pts.length < 2) continue;

      const sRef = nodeRefFromLayout(item.source);
      const tRef = nodeRefFromLayout(item.target);
      if (!sRef || !tRef) continue;

      if (sm) {
        const sRect = nodeRect(item.source);
        const side = sideOf(sRect, pts[0]);
        const v = { x: pts[1].x - pts[0].x, y: pts[1].y - pts[0].y };
        const angle = Math.atan2(v.y, v.x);
        const gk = `${refKey(sRef)}|${side}`;
        const arr = groups.get(gk) ?? [];
        arr.push({ connId: conn.id, end: 'source', angle });
        groups.set(gk, arr);
      }

      if (tm) {
        const tRect = nodeRect(item.target);
        const p0 = pts[pts.length - 1];
        const p1 = pts[pts.length - 2];
        const side = sideOf(tRect, p0);
        const v = { x: p1.x - p0.x, y: p1.y - p0.y };
        const angle = Math.atan2(v.y, v.x);
        const gk = `${refKey(tRef)}|${side}`;
        const arr = groups.get(gk) ?? [];
        arr.push({ connId: conn.id, end: 'target', angle });
        groups.set(gk, arr);
      }
    }

    const out = new Map<string, number>();
    const step = 8;
    for (const [, items] of groups) {
      if (items.length <= 1) continue;
      items.sort((a, b) => (a.angle - b.angle) || a.connId.localeCompare(b.connId));
      const n = items.length;
      for (let i = 0; i < n; i++) {
        const offsetIndex = i - (n - 1) / 2;
        out.set(`${items[i].connId}|${items[i].end}`, offsetIndex * step);
      }
    }
    return out;
  }, [connectionRenderItems, model, pointsByConnectionId]);

  // Crowd size per connection-end group (node, side). Used to slightly increase the
  // search radii for plain ends when multiple relationships attach close together.
  const endLabelCrowdCountByConnEnd = useMemo(() => {
    const groups = new Map<string, Array<{ connId: string; end: 'source' | 'target' }>>();

    for (const item of connectionRenderItems) {
      const conn = item.connection;
      const rel = model.relationships[conn.relationshipId];
      if (!rel) continue;

      const isAssocLike = rel.type === 'uml.association' || rel.type === 'uml.aggregation' || rel.type === 'uml.composition';
      if (!isAssocLike) continue;

      const sm = normalizeMultiplicityLabel((rel as any).attrs?.sourceMultiplicity);
      const tm = normalizeMultiplicityLabel((rel as any).attrs?.targetMultiplicity);
      if (!sm && !tm) continue;

      const pts = pointsByConnectionId.get(conn.id);
      if (!pts || pts.length < 2) continue;

      const sRef = nodeRefFromLayout(item.source);
      const tRef = nodeRefFromLayout(item.target);
      if (!sRef || !tRef) continue;

      if (sm) {
        const sRect = nodeRect(item.source);
        const side = sideOf(sRect, pts[0]);
        const gk = `${refKey(sRef)}|${side}`;
        const arr = groups.get(gk) ?? [];
        arr.push({ connId: conn.id, end: 'source' });
        groups.set(gk, arr);
      }

      if (tm) {
        const tRect = nodeRect(item.target);
        const p0 = pts[pts.length - 1];
        const side = sideOf(tRect, p0);
        const gk = `${refKey(tRef)}|${side}`;
        const arr = groups.get(gk) ?? [];
        arr.push({ connId: conn.id, end: 'target' });
        groups.set(gk, arr);
      }
    }

    const out = new Map<string, number>();
    for (const [, items] of groups) {
      const n = items.length;
      if (n <= 1) continue;
      for (const it of items) {
        out.set(`${it.connId}|${it.end}`, n);
      }
    }
    return out;
  }, [connectionRenderItems, model, pointsByConnectionId]);

  // For better readability in the common case (two close parallel relationships),
  // pick a deterministic *preferred side* per relationship-end (connId|source/target).
  // We then only switch side if collisions occur.
  // This avoids the situation where both labels at the same node side end up on the same
  // side (which makes it hard to visually associate labels with edges).
  const preferredMultiplicitySideByConnEnd = useMemo(() => {
    const groups = new Map<string, Array<{ connId: string; end: 'source' | 'target'; angle: number }>>();

    for (const item of connectionRenderItems) {
      const conn = item.connection;
      const rel = model.relationships[conn.relationshipId];
      if (!rel) continue;
      const isAssocLike = rel.type === 'uml.association' || rel.type === 'uml.aggregation' || rel.type === 'uml.composition';
      if (!isAssocLike) continue;

      const sm = normalizeMultiplicityLabel((rel as any).attrs?.sourceMultiplicity);
      const tm = normalizeMultiplicityLabel((rel as any).attrs?.targetMultiplicity);
      if (!sm && !tm) continue;

      const pts = pointsByConnectionId.get(conn.id);
      if (!pts || pts.length < 2) continue;

      const sRef = nodeRefFromLayout(item.source);
      const tRef = nodeRefFromLayout(item.target);
      if (!sRef || !tRef) continue;

      if (sm) {
        const sRect = nodeRect(item.source);
        const side = sideOf(sRect, pts[0]);
        const v = { x: pts[1].x - pts[0].x, y: pts[1].y - pts[0].y };
        const angle = Math.atan2(v.y, v.x);
        const gk = `${refKey(sRef)}|${side}`;
        const arr = groups.get(gk) ?? [];
        arr.push({ connId: conn.id, end: 'source', angle });
        groups.set(gk, arr);
      }

      if (tm) {
        const tRect = nodeRect(item.target);
        const p0 = pts[pts.length - 1];
        const p1 = pts[pts.length - 2];
        const side = sideOf(tRect, p0);
        const v = { x: p1.x - p0.x, y: p1.y - p0.y };
        const angle = Math.atan2(v.y, v.x);
        const gk = `${refKey(tRef)}|${side}`;
        const arr = groups.get(gk) ?? [];
        arr.push({ connId: conn.id, end: 'target', angle });
        groups.set(gk, arr);
      }
    }

    const preferred = new Map<string, 1 | -1>();
    for (const [, items] of groups) {
      if (items.length <= 1) continue;
      items.sort((a, b) => (a.angle - b.angle) || a.connId.localeCompare(b.connId));
      const n = items.length;
      for (let i = 0; i < n; i++) {
        const offsetIndex = i - (n - 1) / 2;
        const sign = (offsetIndex < 0 ? -1 : 1) as 1 | -1;

        // Store preference per end (connId|source/target).
        preferred.set(`${items[i].connId}|${items[i].end}`, sign);
      }
    }
    return preferred;
  }, [connectionRenderItems, model, pointsByConnectionId]);

  const nearEndSegmentsByNodeSide = useMemo(() => {
    const map = new Map<string, Array<{ connId: string; end: 'source' | 'target'; segs: Array<{ a: Point; b: Point }> }>>();

    for (const item of connectionRenderItems) {
      const conn = item.connection;
      const rel = model.relationships[conn.relationshipId];
      if (!rel) continue;
      const isAssocLike = rel.type === 'uml.association' || rel.type === 'uml.aggregation' || rel.type === 'uml.composition';
      if (!isAssocLike) continue;

      const sm = normalizeMultiplicityLabel((rel as any).attrs?.sourceMultiplicity);
      const tm = normalizeMultiplicityLabel((rel as any).attrs?.targetMultiplicity);
      if (!sm && !tm) continue;

      const pts = pointsByConnectionId.get(conn.id);
      if (!pts || pts.length < 2) continue;

      const sRef = nodeRefFromLayout(item.source);
      const tRef = nodeRefFromLayout(item.target);
      if (!sRef || !tRef) continue;

      if (sm) {
        const sRect = nodeRect(item.source);
        const side = sideOf(sRect, pts[0]);
        const gk = `${refKey(sRef)}|${side}`;
        const segs: Array<{ a: Point; b: Point }> = [];
        segs.push({ a: pts[0], b: pts[1] });
        if (pts.length > 2) segs.push({ a: pts[1], b: pts[2] });
        const arr = map.get(gk) ?? [];
        arr.push({ connId: conn.id, end: 'source', segs });
        map.set(gk, arr);
      }

      if (tm) {
        const tRect = nodeRect(item.target);
        const p0 = pts[pts.length - 1];
        const side = sideOf(tRect, p0);
        const gk = `${refKey(tRef)}|${side}`;
        const segs: Array<{ a: Point; b: Point }> = [];
        const last = pts.length - 1;
        segs.push({ a: pts[last], b: pts[last - 1] });
        if (pts.length > 2) segs.push({ a: pts[last - 1], b: pts[last - 2] });
        const arr = map.get(gk) ?? [];
        arr.push({ connId: conn.id, end: 'target', segs });
        map.set(gk, arr);
      }
    }

    return map;
  }, [connectionRenderItems, model, pointsByConnectionId]);

  return (
    <svg className="diagramRelationships" width={surfaceWidthModel} height={surfaceHeightModel} aria-label="Diagram relationships">
      <RelationshipMarkers />

      {groupBoxDraft ? (
        <rect
          x={Math.min(groupBoxDraft.start.x, groupBoxDraft.current.x)}
          y={Math.min(groupBoxDraft.start.y, groupBoxDraft.current.y)}
          width={Math.abs(groupBoxDraft.start.x - groupBoxDraft.current.x)}
          height={Math.abs(groupBoxDraft.start.y - groupBoxDraft.current.y)}
          fill="none"
          stroke="currentColor"
          strokeDasharray="6 4"
          opacity={0.55}
        />
      ) : null}

      {connectionRenderItems.map((item) => {
        const conn = item.connection;
        const relId = conn.relationshipId;
        const rel = model.relationships[relId];
        if (!rel) return null;

        const points = pointsByConnectionId.get(conn.id);
        if (!points) return null;

        const total = item.totalInGroup;

        const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

        const isSelected = selection.kind === 'relationship' && selection.relationshipId === relId;
        const style = notation.getRelationshipStyle(rel);
        const dasharray = style.line?.dasharray ?? dasharrayForPattern(style.line?.pattern);
        const markerStart = markerUrl(style.markerStart, isSelected);
        const markerEnd = markerUrl(style.markerEnd, isSelected);
        const mid = style.midLabel ? polylineMidPoint(points) : null;
        const showUmlEndLabels = typeof rel.type === 'string' && rel.type.startsWith('uml.');
        const isAssocLike = rel.type === 'uml.association' || rel.type === 'uml.aggregation' || rel.type === 'uml.composition';
        const sm = isAssocLike ? normalizeMultiplicityLabel((rel as any).attrs?.sourceMultiplicity) : null;
        const tm = isAssocLike ? normalizeMultiplicityLabel((rel as any).attrs?.targetMultiplicity) : null;
        const showEndLabels = showUmlEndLabels && showMultiplicities && shouldShowEndLabels({ zoom, isSelected, hasAny: Boolean(sm || tm) });
        const sExtra = endLabelExtraPerpOffsetByConnEnd.get(`${conn.id}|source`) ?? 0;
        const tExtra = endLabelExtraPerpOffsetByConnEnd.get(`${conn.id}|target`) ?? 0;

        const hasDiamond = (m: unknown) => typeof m === 'string' && m.toLowerCase().includes('diamond');
        const sHasDiamondMarker = hasDiamond(style.markerStart);
        const tHasDiamondMarker = hasDiamond(style.markerEnd);

        // Local collision avoidance for end-labels: avoid placing on top of nearby relationship lines.
        const sRef = nodeRefFromLayout(item.source);
        const tRef = nodeRefFromLayout(item.target);

        const sSide = sRef ? sideOf(nodeRect(item.source), points[0]) : null;
        const tSide = tRef ? sideOf(nodeRect(item.target), points[points.length - 1]) : null;

        const sAvoid = (() => {
          if (!sRef || !sSide) return [];
          const gk = `${refKey(sRef)}|${sSide}`;
          const entries = nearEndSegmentsByNodeSide.get(gk) ?? [];
          const segs: Array<{ a: Point; b: Point }> = [];
          for (const e of entries) {
            if (e.connId === conn.id) continue;
            segs.push(...e.segs);
          }
          return segs;
        })();

        const tAvoid = (() => {
          if (!tRef || !tSide) return [];
          const gk = `${refKey(tRef)}|${tSide}`;
          const entries = nearEndSegmentsByNodeSide.get(gk) ?? [];
          const segs: Array<{ a: Point; b: Point }> = [];
          for (const e of entries) {
            if (e.connId === conn.id) continue;
            segs.push(...e.segs);
          }
          return segs;
        })();

        // NOTE: We intentionally avoid ONLY other relationship lines here.
        // If we also treat the relationship's *own* line as a hard collision, we end up
        // rejecting both primary and secondary candidates and always falling back to the
        // centered placement. The primary/secondary candidates are already offset away from
        // the edge, so they remain readable without needing to hard-reject against the edge
        // itself.


        const sPreferredSign = preferredMultiplicitySideByConnEnd.get(`${conn.id}|source`) ?? 1;
        const tPreferredSign = preferredMultiplicitySideByConnEnd.get(`${conn.id}|target`) ?? 1;

        const sPos =
          showEndLabels && sm
            ? placeMultiplicityLabel({
                points,
                which: 'source',
                text: sm,
                avoidSegments: sAvoid,
                nodeRect: nodeRect(item.source),
                hasDiamondMarker: sHasDiamondMarker,
                baseExtraPerpOffset: sExtra,

                preferredSign: sPreferredSign,
                crowdCount: endLabelCrowdCountByConnEnd.get(`${conn.id}|source`) ?? 1,
              })
            : null;
        const tPos =
          showEndLabels && tm
            ? placeMultiplicityLabel({
                points,
                which: 'target',
                text: tm,
                avoidSegments: tAvoid,
                nodeRect: nodeRect(item.target),
                hasDiamondMarker: tHasDiamondMarker,
                baseExtraPerpOffset: tExtra,

                preferredSign: tPreferredSign,
                crowdCount: endLabelCrowdCountByConnEnd.get(`${conn.id}|target`) ?? 1,
              })
            : null;


        return (
          <g key={conn.id}>
            {/*
              Large invisible hit target so relationships are easy to select.
              (The visible line itself has pointer-events disabled.)
            */}

            <path
              className="diagramRelHit"
              d={d}
              style={{ strokeWidth: total > 1 ? 10 : 14 }}
              onClick={(e) => {
                if (linkDrag) return;
                e.preventDefault();
                e.stopPropagation();
                onSelect({ kind: 'relationship', relationshipId: relId, viewId });
              }}
            />
            <path
              className={'diagramRelLine' + (isSelected ? ' isSelected' : '')}
              d={d}
              markerStart={markerStart}
              markerEnd={markerEnd}
              strokeDasharray={dasharray ?? undefined}
            />

            {mid ? (
              <text
                x={mid.x}
                y={mid.y - 6}
                fontFamily="system-ui, -apple-system, Segoe UI, Roboto, Arial"
                fontSize={12}
                fontWeight={800}
                fill="rgba(0,0,0,0.65)"
                textAnchor="middle"
                pointerEvents="none"
              >
                {style.midLabel}
              </text>
            ) : null}

            {sPos ? (
              <text
                className="diagramRelEndLabel"
                x={sPos.x}
                y={sPos.y}
                fontFamily="system-ui, -apple-system, Segoe UI, Roboto, Arial"
                fontSize={11}
                fontWeight={700}
                fill="rgba(0,0,0,0.65)"
                stroke="rgba(255,255,255,0.9)"
                strokeWidth={3}
                paintOrder="stroke"
                textAnchor="middle"
                dominantBaseline="middle"
                pointerEvents="none"
              >
                {sm}
              </text>
            ) : null}

            {tPos ? (
              <text
                className="diagramRelEndLabel"
                x={tPos.x}
                y={tPos.y}
                fontFamily="system-ui, -apple-system, Segoe UI, Roboto, Arial"
                fontSize={11}
                fontWeight={700}
                fill="rgba(0,0,0,0.65)"
                stroke="rgba(255,255,255,0.9)"
                strokeWidth={3}
                paintOrder="stroke"
                textAnchor="middle"
                dominantBaseline="middle"
                pointerEvents="none"
              >
                {tm}
              </text>
            ) : null}

          </g>
        );
      })}

      {/* Link creation preview */}
      {linkDrag
        ? (() => {
            const start = linkDrag.sourcePoint;
            let end = linkDrag.currentPoint;
            if (linkDrag.targetRef) {
              const key = refKey(linkDrag.targetRef);
              const t = nodes.find((n) => {
                const r = nodeRefFromLayout(n);
                return r ? refKey(r) === key : false;
              });
              if (t) end = { x: t.x + t.width / 2, y: t.y + t.height / 2 };
            }
            const d = `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
            return (
              <path
                key="__preview__"
                d={d}
                fill="none"
                stroke="var(--diagram-rel-stroke)"
                strokeWidth={2}
                strokeDasharray="6 5"
                markerEnd={markerUrl('arrowOpen', false)}
              />
            );
          })()
        : null}
    </svg>
  );
}
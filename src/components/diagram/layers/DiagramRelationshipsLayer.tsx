import { useMemo } from 'react';
import type { Model, ViewNodeLayout } from '../../../domain';
import type { Notation } from '../../../notations';
import type { Selection } from '../../model/selection';
import { RelationshipMarkers } from '../RelationshipMarkers';
import type { DiagramLinkDrag } from '../DiagramNode';
import type { GroupBoxDraft } from '../hooks/useDiagramToolState';
import type { Point } from '../geometry';
import {
  nodeRefFromLayout,
  polylineMidPoint,
} from '../geometry';
import { refKey } from '../connectable';
import { markerUrl } from '../../../diagram/relationships/markers';
import { dasharrayForPattern } from '../../../diagram/relationships/style';
import { computeRoutedConnectionPoints, type ConnectionRenderItem } from '../relationships/computeRoutedConnectionPoints';
import { placeMultiplicityLabel, sideOf } from '../relationships/relationshipLabelGeometry';

export type { ConnectionRenderItem };

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
    return computeRoutedConnectionPoints({ model, nodes, connectionRenderItems, gridSize });
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

        const d = points.map((p: Point, i: number) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

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
        const tPreferredSign0 = preferredMultiplicitySideByConnEnd.get(`${conn.id}|target`) ?? 1;

        // Self-associations (A -> A): both end-labels may end up extremely close.
        // We handle this by (a) increasing crowd count (done by existing grouping logic) and
        // (b) applying a small deterministic post-offset if the two labels overlap.
        const isSelfAssoc =
          (item.source.elementId && item.target.elementId && item.source.elementId === item.target.elementId) ||
          (item.source.connectorId && item.target.connectorId && item.source.connectorId === item.target.connectorId) ||
          (item.source.objectId && item.target.objectId && item.source.objectId === item.target.objectId);

        const tPreferredSign = isSelfAssoc && sPreferredSign === tPreferredSign0 ? ((tPreferredSign0 === 1 ? -1 : 1) as 1 | -1) : tPreferredSign0;

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
        let tPos =
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

        // If this is a self-association and both ends have labels, ensure they don't overlap visually.
        // We do a simple post-adjustment based on the attachment side for the target end.
        if (isSelfAssoc && sPos && tPos) {
          const dx = Math.abs(sPos.x - tPos.x);
          const dy = Math.abs(sPos.y - tPos.y);
          if (dx < 6 && dy < 6) {
            const side = tSide ?? 'R';
            const bump = 14;
            if (side === 'L' || side === 'R') {
              tPos = { ...tPos, y: tPos.y + bump };
            } else {
              tPos = { ...tPos, x: tPos.x + bump };
            }
          }
        }


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
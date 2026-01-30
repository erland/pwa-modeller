import { useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import { QuickTooltip } from './QuickTooltip';
import { measureTextPx, measureWrappedLabel, wrapLabel } from './graphLabelLayout';

export type MiniColumnGraphTooltip = { title: string; lines: string[] };

export type MiniColumnGraphNode = {
  id: string;
  label: string;
  /** Column index (0 = left-most). */
  level: number;
  /** Optional explicit vertical ordering inside a column. If omitted, nodes are sorted by label. */
  order?: number;
  /** Optional background fill (CSS color or var). */
  bg?: string;
  /** Optional overlay badge (e.g., node degree). */
  badge?: string;
  /** Optional per-node size scale (e.g., based on score). Clamp to a small range like 0.85–1.25. */
  sizeScale?: number;
  /** UI-only: hidden nodes are not rendered. */
  hidden?: boolean;
};

export type MiniColumnGraphEdge = {
  id: string;
  from: string;
  to: string;
  /** UI-only: hidden edges are kept but not rendered. */
  hidden?: boolean;
};

type Props = {
  nodes: MiniColumnGraphNode[];
  edges: MiniColumnGraphEdge[];

  selectedNodeId?: string | null;
  selectedEdgeId?: string | null;
  /** Optional selection predicate (useful when selection is by relationshipId rather than edge id). */
  isEdgeActive?: (edgeId: string) => boolean;

  onSelectNode?: (id: string) => void;
  onSelectEdge?: (id: string) => void;

  getNodeTooltip?: (id: string) => MiniColumnGraphTooltip | null;
  getEdgeTooltip?: (id: string) => MiniColumnGraphTooltip | null;

  /** Optional controls rendered inside an active/selected node. */
  renderNodeControls?: (nodeId: string, nodeWidth: number) => JSX.Element | null;

  wrapLabels?: boolean;
  autoFitColumns?: boolean;

  /** When the graph is huge, disable expensive wrapping/auto-fit for responsiveness. */
  richLayoutMaxNodes?: number;

  /** Render mode */
  responsive?: boolean; // width=100% with viewBox (Analysis style)
  ariaLabel?: string;
  containerStyle?: CSSProperties;
};

function stableSortLabel(label: string) {
  return (label || '').trim().toLowerCase();
}

function nodeBaseRect() {
  // Base width; width may expand per column (bounded to 1.5x).
  const w = 190;
  const h = 34;
  return { w, h };
}

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}


function edgePath(from: { x: number; y: number; w: number; h: number }, to: { x: number; y: number; w: number; h: number }) {
  const x1 = from.x + from.w;
  const y1 = from.y + from.h / 2;
  const x2 = to.x;
  const y2 = to.y + to.h / 2;

  const dx = Math.max(26, Math.min(120, (x2 - x1) / 2));
  const c1x = x1 + dx;
  const c1y = y1;
  const c2x = x2 - dx;
  const c2y = y2;

  return `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
}


function polylinePathRounded(points: Array<{ x: number; y: number }>, radius: number): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  const rDefault = Math.max(0, radius);

  const parts: string[] = [];
  parts.push(`M ${points[0].x} ${points[0].y}`);

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = i + 1 < points.length ? points[i + 1] : null;

    if (!next) {
      parts.push(` L ${cur.x} ${cur.y}`);
      continue;
    }

    const v1x = cur.x - prev.x;
    const v1y = cur.y - prev.y;
    const v2x = next.x - cur.x;
    const v2y = next.y - cur.y;

    // If the path doesn't turn here, keep it as a straight segment.
    const turns = (v1x !== 0 && v2y !== 0) || (v1y !== 0 && v2x !== 0);
    if (!turns) {
      parts.push(` L ${cur.x} ${cur.y}`);
      continue;
    }

    const len1 = Math.abs(v1x) + Math.abs(v1y);
    const len2 = Math.abs(v2x) + Math.abs(v2y);
    const r = Math.min(rDefault, len1 / 2, len2 / 2);

    const u1x = v1x === 0 ? 0 : v1x > 0 ? 1 : -1;
    const u1y = v1y === 0 ? 0 : v1y > 0 ? 1 : -1;
    const u2x = v2x === 0 ? 0 : v2x > 0 ? 1 : -1;
    const u2y = v2y === 0 ? 0 : v2y > 0 ? 1 : -1;

    const p1 = { x: cur.x - u1x * r, y: cur.y - u1y * r };
    const p2 = { x: cur.x + u2x * r, y: cur.y + u2y * r };

    parts.push(` L ${p1.x} ${p1.y}`);
    // Quadratic corner: control point at the corner itself.
    parts.push(` Q ${cur.x} ${cur.y} ${p2.x} ${p2.y}`);
  }

  return parts.join('');
}

export function MiniColumnGraph({
  nodes,
  edges,
  selectedNodeId,
  selectedEdgeId,
  isEdgeActive,
  onSelectNode,
  onSelectEdge,
  getNodeTooltip,
  getEdgeTooltip,
  renderNodeControls,
  wrapLabels = true,
  autoFitColumns = true,
  richLayoutMaxNodes = 500,
  responsive = false,
  ariaLabel = 'Mini column graph',
  containerStyle
}: Props) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; title: string; lines: string[] } | null>(null);

  // Stable per-instance marker id (avoid collisions when multiple graphs are shown at once).
  const markerIdRef = useRef(`mcgArrow_${Math.random().toString(36).slice(2)}`);

  // Cache wrapped label results to avoid re-wrapping/measuring on every render.
  const wrapCacheRef = useRef(new Map<string, { lines: string[]; maxLineWidthPx: number }>());

  const layout = useMemo(() => {
    const visibleNodes = nodes.filter((n) => !n.hidden);
    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
    const nodeCount = visibleNodes.length;
    const effectiveWrapLabels = wrapLabels && nodeCount <= richLayoutMaxNodes;
    const effectiveAutoFitColumns = autoFitColumns && nodeCount <= richLayoutMaxNodes;

    const rect = nodeBaseRect();
    const font = '12px system-ui';
    const paddingX = 20; // total (left+right) inside node
    const lineHeight = 14;
    const paddingY = 10;

    const cache = wrapCacheRef.current;
    const getWrapped = (id: string, label: string, maxWidthPx: number, maxLines: number) => {
      const k = `${id}\u0000${label}\u0000${maxWidthPx}\u0000${maxLines}`;
      const hit = cache.get(k);
      if (hit) return hit;

      const wrapped = wrapLabel(label, { maxWidthPx, maxLines, font, measureTextPx });
      const metrics = measureWrappedLabel(wrapped, font, measureTextPx);
      const val = { lines: wrapped.lines, maxLineWidthPx: metrics.maxLineWidthPx };

      if (cache.size > 5000) cache.clear();
      cache.set(k, val);
      return val;
    };

    // Group per level
    const byLevel = new Map<number, MiniColumnGraphNode[]>();
    for (const n of visibleNodes) {
      const arr = byLevel.get(n.level) ?? [];
      arr.push(n);
      byLevel.set(n.level, arr);
    }
    const levels = [...byLevel.keys()].sort((a, b) => a - b);
    const nodeLevelById = new Map<string, number>(visibleNodes.map((n) => [n.id, n.level]));

    const hasIntermediateLevel = (a: number, b: number): boolean => {
      const min = Math.min(a, b);
      const max = Math.max(a, b);
      for (const l of levels) {
        if (l > min && l < max) return true;
      }
      return false;
    };

    // Stage 2: reserve top space and assign lanes for long edges (edges that skip intermediate visible columns).
    const longEdgeInfos: Array<{ id: string; spanKey: string }> = [];
    for (const e of edges) {
      if (e.hidden) continue;
      if (!visibleNodeIds.has(e.from) || !visibleNodeIds.has(e.to)) continue;
      const fromLvl = nodeLevelById.get(e.from) ?? 0;
      const toLvl = nodeLevelById.get(e.to) ?? 0;
      if (!hasIntermediateLevel(fromLvl, toLvl)) continue;
      const min = Math.min(fromLvl, toLvl);
      const max = Math.max(fromLvl, toLvl);
      // Group by span; direction doesn't matter for lane packing.
      longEdgeInfos.push({ id: e.id, spanKey: `${min}->${max}` });
    }

    const laneSpacing = 10;
    const maxLanes = 6;
    const laneCount = Math.min(maxLanes, longEdgeInfos.length);
    const lanePadTop = laneCount > 0 ? laneCount * laneSpacing + 18 : 0;

    const laneByEdgeId = new Map<string, number>();
    if (laneCount > 0) {
      const spanCounters = new Map<string, number>();
      const sorted = [...longEdgeInfos].sort((a, b) => a.id.localeCompare(b.id));
      for (const info of sorted) {
        const idx = spanCounters.get(info.spanKey) ?? 0;
        laneByEdgeId.set(info.id, idx % laneCount);
        spanCounters.set(info.spanKey, idx + 1);
      }
    }

    // Column base widths (auto-fit) + max size scale per column.
    const colBaseWByLevel = new Map<number, number>();
    const colMaxScaleByLevel = new Map<number, number>();
    for (const level of levels) {
      const colNodes = byLevel.get(level) ?? [];
      const maxScale = colNodes.reduce((m, n) => Math.max(m, clamp(n.sizeScale ?? 1, 0.85, 1.25)), 1);
      colMaxScaleByLevel.set(level, maxScale);

      if (!effectiveAutoFitColumns) {
        colBaseWByLevel.set(level, rect.w);
        continue;
      }

      const maxNeeded = colNodes.reduce((m, n) => {
        const label = n.label || '';
        if (effectiveWrapLabels) {
          const w = getWrapped(n.id, label, rect.w - paddingX, 3);
          return Math.max(m, w.maxLineWidthPx);
        }
        return Math.max(m, measureTextPx(label, font));
      }, 0);

      const desired = maxNeeded + paddingX;
      const bounded = Math.min(rect.w * 1.5, Math.max(rect.w, desired));
      colBaseWByLevel.set(level, bounded);
    }

    // X offsets
    const colGap = 40;
    const marginX = 24;
    const xByLevel = new Map<number, number>();
    let xCursor = marginX;
    for (const level of levels) {
      const baseW = colBaseWByLevel.get(level) ?? rect.w;
      const maxScale = colMaxScaleByLevel.get(level) ?? 1;
      const colW = baseW * maxScale;
      xByLevel.set(level, xCursor);
      xCursor += colW + colGap;
    }

    // Layout nodes
    const baseYSpacing = 74; // allow up to 3 lines
    const marginY = 24 + lanePadTop;

    const laidOutNodes: Array<{
      id: string;
      label: string;
      lines: string[];
      level: number;
      order: number;
      x: number;
      y: number;
      w: number;
      h: number;
      bg?: string;
      badge?: string;
    }> = [];

    for (const level of levels) {
      const colNodes = [...(byLevel.get(level) ?? [])];

      const hasOrder = colNodes.some((n) => typeof n.order === 'number');
      colNodes.sort((a, b) => {
        if (hasOrder) return (a.order ?? 0) - (b.order ?? 0) || stableSortLabel(a.label).localeCompare(stableSortLabel(b.label));
        return stableSortLabel(a.label).localeCompare(stableSortLabel(b.label));
      });

      const baseNodeW = colBaseWByLevel.get(level) ?? rect.w;
      // Per-column spacing based on the tallest scaled node in that column (avoid overlaps when scaling is enabled).
      const maxScale = colMaxScaleByLevel.get(level) ?? 1;
      const ySpacing = Math.max(baseYSpacing, rect.h * maxScale + 44);

      colNodes.forEach((n, order) => {
        const label = n.label || '';
        const nodeScale = clamp(n.sizeScale ?? 1, 0.85, 1.25);
        const nodeW = baseNodeW * nodeScale;
        const maxTextW = nodeW - paddingX;
        const maxLines = effectiveWrapLabels ? 3 : 1;
        const wrapped = getWrapped(n.id, label, maxTextW, maxLines);
        const baseH = effectiveWrapLabels ? Math.max(rect.h, paddingY + wrapped.lines.length * lineHeight + paddingY) : rect.h;
        const h = baseH * nodeScale;

        const x = xByLevel.get(level) ?? marginX;
        const y = marginY + order * ySpacing;

        laidOutNodes.push({
          id: n.id,
          label,
          lines: wrapped.lines,
          level,
          order,
          x,
          y,
          w: nodeW,
          h,
          bg: n.bg,
          badge: n.badge
        });
      });
    }

    // Node positions for edge routing
    const nodePos = new Map<string, { x: number; y: number; w: number; h: number }>();
    const nodeLevel = new Map<string, number>();
    for (const n of laidOutNodes) {
      nodePos.set(n.id, { x: n.x, y: n.y, w: n.w, h: n.h });
      nodeLevel.set(n.id, n.level);
    }

    // Column bands (used for "gutter" routing of long edges that would otherwise cut through intermediate columns).
    const colBandByLevel = new Map<number, { left: number; right: number }>();
    for (const level of levels) {
      const left = xByLevel.get(level) ?? marginX;
      const baseW = colBaseWByLevel.get(level) ?? rect.w;
      const maxScale = colMaxScaleByLevel.get(level) ?? 1;
      const colW = baseW * maxScale;
      colBandByLevel.set(level, { left, right: left + colW });
    }

    // Stage 3: prefer routing long edges through a free horizontal "corridor" that exists across all
    // intermediate columns, falling back to the top bus lanes when no corridor is available.
    const yPad = 8;
    const yMinBound = 10;
    const yMaxBound = Math.max(200, ...laidOutNodes.map((n) => n.y + n.h)) + 24;

    type Interval = { a: number; b: number };

    const mergeIntervals = (xs: Interval[]): Interval[] => {
      if (xs.length === 0) return [];
      const sorted = [...xs].sort((p, q) => (p.a - q.a) || (p.b - q.b));
      const out: Interval[] = [];
      let cur = { ...sorted[0] };
      for (let i = 1; i < sorted.length; i++) {
        const it = sorted[i];
        if (it.a <= cur.b) cur.b = Math.max(cur.b, it.b);
        else {
          out.push(cur);
          cur = { ...it };
        }
      }
      out.push(cur);
      return out;
    };

    const complementIntervals = (blocked: Interval[], min: number, max: number): Interval[] => {
      if (max <= min) return [];
      const out: Interval[] = [];
      let cursor = min;
      for (const b of blocked) {
        const a = Math.max(min, Math.min(max, b.a));
        const bb = Math.max(min, Math.min(max, b.b));
        if (bb <= min || a >= max) continue;
        if (a > cursor) out.push({ a: cursor, b: a });
        cursor = Math.max(cursor, bb);
        if (cursor >= max) break;
      }
      if (cursor < max) out.push({ a: cursor, b: max });
      return out;
    };

    const intersectIntervalLists = (a: Interval[], b: Interval[]): Interval[] => {
      const out: Interval[] = [];
      let i = 0;
      let j = 0;
      while (i < a.length && j < b.length) {
        const lo = Math.max(a[i].a, b[j].a);
        const hi = Math.min(a[i].b, b[j].b);
        if (hi > lo) out.push({ a: lo, b: hi });
        if (a[i].b < b[j].b) i++;
        else j++;
      }
      return out;
    };

    const chooseBestInterval = (intervals: Interval[], desiredY: number): Interval | undefined => {
      if (intervals.length === 0) return undefined;
      let best = intervals[0];
      let bestDist = Number.POSITIVE_INFINITY;
      for (const it of intervals) {
        const clamped = Math.max(it.a, Math.min(it.b, desiredY));
        const dist = Math.abs(clamped - desiredY);
        if (dist < bestDist) {
          bestDist = dist;
          best = it;
        }
      }
      return best;
    };

    const blockedByLevel = new Map<number, Interval[]>();
    for (const n of laidOutNodes) {
      const xs = blockedByLevel.get(n.level) ?? [];
      xs.push({ a: n.y - yPad, b: n.y + n.h + yPad });
      blockedByLevel.set(n.level, xs);
    }
    const mergedBlockedByLevel = new Map<number, Interval[]>();
    for (const [lvl, xs] of blockedByLevel.entries()) mergedBlockedByLevel.set(lvl, mergeIntervals(xs));

    const getFreeIntervalsForLevel = (lvl: number): Interval[] => {
      const blocked = mergedBlockedByLevel.get(lvl) ?? [];
      return complementIntervals(blocked, yMinBound, yMaxBound);
    };

    const getIntermediateLevels = (fromLvl: number, toLvl: number): number[] => {
      const min = Math.min(fromLvl, toLvl);
      const max = Math.max(fromLvl, toLvl);
      return levels.filter((l) => l > min && l < max);
    };

    const findCorridorInterval = (fromLvl: number, toLvl: number, desiredY: number): Interval | undefined => {
      const mids = getIntermediateLevels(fromLvl, toLvl);
      if (mids.length === 0) return undefined;
      let acc: Interval[] | undefined;
      for (const lvl of mids) {
        const free = getFreeIntervalsForLevel(lvl);
        acc = acc ? intersectIntervalLists(acc, free) : free;
        if (!acc || acc.length === 0) return undefined;
      }
      return chooseBestInterval(acc ?? [], desiredY);
    };

    const nextLevelRightOf = (lvl: number): number | undefined => {
      for (const l of levels) if (l > lvl) return l;
      return undefined;
    };
    const prevLevelLeftOf = (lvl: number): number | undefined => {
      for (let i = levels.length - 1; i >= 0; i--) {
        const l = levels[i];
        if (l < lvl) return l;
      }
      return undefined;
    };

    const paths: Array<{ id: string; d: string }> = [];
    for (const e of edges) {
      if (e.hidden) continue;
      const from = nodePos.get(e.from);
      const to = nodePos.get(e.to);
      if (!from || !to) continue;

      const fromLvl = nodeLevel.get(e.from) ?? 0;
      const toLvl = nodeLevel.get(e.to) ?? 0;

      // Stage 2: long-edge routing. If an edge skips at least one visible column, route it via a dedicated
      // top "bus" lane (with reserved padding) to avoid drawing on top of intermediate column nodes.
      if (hasIntermediateLevel(fromLvl, toLvl)) {
        const fromMidY = from.y + from.h / 2;
        const toMidY = to.y + to.h / 2;

        const lane = laneByEdgeId.get(e.id) ?? 0;
        const laneOffset = laneCount > 1 ? (lane - (laneCount - 1) / 2) * (laneSpacing * 0.6) : 0;

        const desiredY = (fromMidY + toMidY) / 2;
        const corridor = findCorridorInterval(fromLvl, toLvl, desiredY);

        // Prefer a free corridor (often below/above intermediate nodes), otherwise fall back to the top bus lanes.
        if (corridor) {
          const corridorY = Math.max(corridor.a + 2, Math.min(corridor.b - 2, desiredY + laneOffset));

          if (toLvl > fromLvl) {
            const next = nextLevelRightOf(fromLvl);
            const prev = prevLevelLeftOf(toLvl);
            const fromBand = colBandByLevel.get(fromLvl);
            const nextBand = next !== undefined ? colBandByLevel.get(next) : undefined;
            const prevBand = prev !== undefined ? colBandByLevel.get(prev) : undefined;
            const toBand = colBandByLevel.get(toLvl);

            if (!fromBand || !toBand || !nextBand || !prevBand) {
              paths.push({ id: e.id, d: edgePath(from, to) });
            } else {
              const gutterX1 = fromBand.right + (nextBand.left - fromBand.right) / 2;
              const gutterX2 = prevBand.right + (toBand.left - prevBand.right) / 2;
              const xStart = from.x + from.w;
              const xEnd = to.x;

              const d = polylinePathRounded(
                [
                  { x: xStart, y: fromMidY },
                  { x: gutterX1, y: fromMidY },
                  { x: gutterX1, y: corridorY },
                  { x: gutterX2, y: corridorY },
                  { x: gutterX2, y: toMidY },
                  { x: xEnd, y: toMidY }
                ],
                6
              );
              paths.push({ id: e.id, d });
            }
            continue;
          }

          if (toLvl < fromLvl) {
            const prev = prevLevelLeftOf(fromLvl);
            const next = nextLevelRightOf(toLvl);
            const fromBand = colBandByLevel.get(fromLvl);
            const prevBand = prev !== undefined ? colBandByLevel.get(prev) : undefined;
            const nextBand = next !== undefined ? colBandByLevel.get(next) : undefined;
            const toBand = colBandByLevel.get(toLvl);

            if (!fromBand || !toBand || !prevBand || !nextBand) {
              paths.push({ id: e.id, d: edgePath(from, to) });
            } else {
              const gutterX1 = prevBand.right + (fromBand.left - prevBand.right) / 2;
              const gutterX2 = toBand.right + (nextBand.left - toBand.right) / 2;
              const xStart = from.x;
              const xEnd = to.x + to.w;

              const d = polylinePathRounded(
                [
                  { x: xStart, y: fromMidY },
                  { x: gutterX1, y: fromMidY },
                  { x: gutterX1, y: corridorY },
                  { x: gutterX2, y: corridorY },
                  { x: gutterX2, y: toMidY },
                  { x: xEnd, y: toMidY }
                ],
                6
              );
              paths.push({ id: e.id, d });
            }
            continue;
          }
        }

        const busYBase = 24 + 8;
        const busY = laneCount > 0 ? busYBase + lane * laneSpacing : 12;

        if (toLvl > fromLvl) {
          const next = nextLevelRightOf(fromLvl);
          const prev = prevLevelLeftOf(toLvl);
          const fromBand = colBandByLevel.get(fromLvl);
          const nextBand = next !== undefined ? colBandByLevel.get(next) : undefined;
          const prevBand = prev !== undefined ? colBandByLevel.get(prev) : undefined;
          const toBand = colBandByLevel.get(toLvl);

          // Fallback to simple curve if we can't resolve gutter geometry.
          if (!fromBand || !toBand || !nextBand || !prevBand) {
            paths.push({ id: e.id, d: edgePath(from, to) });
            continue;
          }

          const gutterX1 = fromBand.right + (nextBand.left - fromBand.right) / 2;
          const gutterX2 = prevBand.right + (toBand.left - prevBand.right) / 2;
          const xStart = from.x + from.w;
          const xEnd = to.x;

          const d = polylinePathRounded([

            { x: xStart, y: fromMidY },
            { x: gutterX1, y: fromMidY },
            { x: gutterX1, y: busY },
            { x: gutterX2, y: busY },
            { x: gutterX2, y: toMidY },
            { x: xEnd, y: toMidY }
          ],
            6
          );
          paths.push({ id: e.id, d });
          continue;
        }

        if (toLvl < fromLvl) {
          const prev = prevLevelLeftOf(fromLvl);
          const next = nextLevelRightOf(toLvl);
          const fromBand = colBandByLevel.get(fromLvl);
          const prevBand = prev !== undefined ? colBandByLevel.get(prev) : undefined;
          const nextBand = next !== undefined ? colBandByLevel.get(next) : undefined;
          const toBand = colBandByLevel.get(toLvl);

          if (!fromBand || !toBand || !prevBand || !nextBand) {
            paths.push({ id: e.id, d: edgePath(from, to) });
            continue;
          }

          const gutterX1 = prevBand.right + (fromBand.left - prevBand.right) / 2;
          const gutterX2 = toBand.right + (nextBand.left - toBand.right) / 2;
          const xStart = from.x; // leave from left edge
          const xEnd = to.x + to.w; // enter target from right edge

          const d = polylinePathRounded([

            { x: xStart, y: fromMidY },
            { x: gutterX1, y: fromMidY },
            { x: gutterX1, y: busY },
            { x: gutterX2, y: busY },
            { x: gutterX2, y: toMidY },
            { x: xEnd, y: toMidY }
          ],
            6
          );
          paths.push({ id: e.id, d });
          continue;
        }
      }

      paths.push({ id: e.id, d: edgePath(from, to) });
    }

    const height = Math.max(160, ...laidOutNodes.map((n) => n.y + n.h + 24));
    const width = xCursor + 120;

    return { nodes: laidOutNodes, paths, width, height, markerId: markerIdRef.current };
  }, [nodes, edges, wrapLabels, autoFitColumns, richLayoutMaxNodes]);

  return (
    <div
      style={{
        border: '1px solid var(--border-1)',
        borderRadius: 12,
        overflow: 'auto',
        ...(containerStyle ?? {})
      }}
    >
      <svg
        width={responsive ? '100%' : layout.width}
        height={responsive ? Math.max(220, Math.min(520, layout.height)) : layout.height}
        viewBox={responsive ? `0 0 ${Math.max(360, layout.width)} ${Math.max(220, layout.height)}` : undefined}
        role="img"
        aria-label={ariaLabel}
      >
        <defs>
          <marker
            id={layout.markerId}
            viewBox="0 0 10 10"
            refX="10"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>

        {/* Edges */}
        {layout.paths.map((p) => {
          const active = isEdgeActive ? isEdgeActive(p.id) : selectedEdgeId === p.id;
          return (
            <g key={p.id} style={{ color: 'currentColor' }}>
              {/* Click target */}
              {onSelectEdge ? (
                <path
                  d={p.d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={10}
                  style={{ cursor: 'pointer' }}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectEdge(p.id)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') onSelectEdge(p.id);
                  }}
                />
              ) : null}

              <path
                d={p.d}
                fill="none"
                stroke="currentColor"
                opacity={active ? 0.95 : 0.35}
                strokeWidth={active ? 2.2 : 1.2}
                markerEnd={`url(#${layout.markerId})`}
                onMouseMove={(e) => {
                  const t = getEdgeTooltip?.(p.id);
                  if (!t) return;
                  setTooltip({ x: e.clientX + 12, y: e.clientY + 12, title: t.title, lines: t.lines });
                }}
                onMouseLeave={() => setTooltip(null)}
                onClick={() => onSelectEdge?.(p.id)}
                style={{ cursor: onSelectEdge ? 'pointer' : 'default' }}
              />
            </g>
          );
        })}

        {/* Nodes */}
        {layout.nodes.map((n) => {
          const active = selectedNodeId === n.id;
          const fill = n.bg ?? 'rgba(255,255,255,0.9)';
          const svgTitle = n.label || '(unnamed)';
          return (
            <g
              key={n.id}
              transform={`translate(${n.x},${n.y})`}
              role={onSelectNode ? 'button' : undefined}
              tabIndex={onSelectNode ? 0 : undefined}
              onMouseMove={(e) => {
                const tip = getNodeTooltip?.(n.id);
                if (!tip) return;
                setTooltip({ x: e.clientX + 12, y: e.clientY + 12, title: tip.title, lines: tip.lines });
              }}
              onMouseLeave={() => setTooltip(null)}
              onClick={(ev) => {
                onSelectNode?.(n.id);
                // Keep tooltip responsive for click navigation too.
                const tip = getNodeTooltip?.(n.id);
                if (tip) setTooltip({ x: ev.clientX + 12, y: ev.clientY + 12, title: tip.title, lines: tip.lines });
              }}
              onKeyDown={(ev) => {
                if (!onSelectNode) return;
                if (ev.key === 'Enter' || ev.key === ' ') onSelectNode(n.id);
              }}
              style={{ cursor: onSelectNode ? 'pointer' : 'default' }}
            >
              <rect
                width={n.w}
                height={n.h}
                rx={10}
                ry={10}
                fill={fill}
                opacity={0.22}
                stroke="currentColor"
                strokeOpacity={active ? 0.9 : 0.25}
                strokeWidth={active ? 2.2 : 1}
              />
              {n.badge && String(n.badge).trim() ? (() => {
                const badgeText = String(n.badge).trim();
                const font = '11px system-ui';
                const padX = 6;
                const badgeW = Math.min(n.w - 16, measureTextPx(badgeText, font) + padX * 2);
                const badgeH = 16;
                const bx = Math.max(8, n.w - badgeW - 8);
                const by = 8;
                return (
                  <g aria-label={`Node metric badge: ${badgeText}`}>
                    <rect
                      x={bx}
                      y={by}
                      width={badgeW}
                      height={badgeH}
                      rx={8}
                      ry={8}
                      fill="rgba(0,0,0,0.08)"
                      stroke="currentColor"
                      strokeOpacity={0.18}
                    />
                    <text
                      x={bx + badgeW / 2}
                      y={by + 12}
                      textAnchor="middle"
                      fontSize={11}
                      fill="currentColor"
                      opacity={0.85}
                      style={{ userSelect: 'none' }}
                    >
                      {badgeText}
                    </text>
                  </g>
                );
              })() : null}
              <text x={10} y={18} fontSize={12} fill="currentColor" opacity={0.9} style={{ userSelect: 'none' }}>
                {n.lines.length ? (
                  n.lines.map((line, idx) => (
                    <tspan key={idx} x={10} dy={idx === 0 ? 0 : 14}>
                      {line}
                    </tspan>
                  ))
                ) : (
                  <tspan x={10} dy={0}>
                    (unnamed)
                  </tspan>
                )}
                <title>{svgTitle}</title>
              </text>
              {active && renderNodeControls ? renderNodeControls(n.id, n.w) : null}
            </g>
          );
        })}
      </svg>

      {tooltip ? (
        <QuickTooltip open={true} x={tooltip.x} y={tooltip.y} title={tooltip.title} lines={tooltip.lines} onClose={() => setTooltip(null)} />
      ) : null}
    </div>
  );
}

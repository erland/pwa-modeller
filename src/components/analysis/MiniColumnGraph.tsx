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
    const marginY = 24;

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
    for (const n of laidOutNodes) nodePos.set(n.id, { x: n.x, y: n.y, w: n.w, h: n.h });

    const paths: Array<{ id: string; d: string }> = [];
    for (const e of edges) {
      if (e.hidden) continue;
      const from = nodePos.get(e.from);
      const to = nodePos.get(e.to);
      if (!from || !to) continue;
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

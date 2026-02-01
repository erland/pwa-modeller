import { useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import { QuickTooltip } from './QuickTooltip';
import { measureTextPx } from './graphLabelLayout';
import { computeMiniColumnGraphLayout } from './miniColumnGraphLayout';

import type { MiniColumnGraphEdge, MiniColumnGraphNode, MiniColumnGraphTooltip } from './miniColumnGraphTypes';

export type { MiniColumnGraphEdge, MiniColumnGraphNode, MiniColumnGraphTooltip } from './miniColumnGraphTypes';

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

// All layout/geometry calculations live in miniColumnGraphLayout.ts.

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
    return {
      ...computeMiniColumnGraphLayout({
        nodes,
        edges,
        wrapLabels,
        autoFitColumns,
        richLayoutMaxNodes,
        wrapCache: wrapCacheRef.current
      }),
      markerId: markerIdRef.current
    };
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

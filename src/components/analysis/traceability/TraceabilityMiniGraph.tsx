import { useMemo, useState } from 'react';

import type { ElementType, Model } from '../../../domain';
import type { ModelKind } from '../../../domain/types';
import type { TraceEdge, TraceNode, TraceSelection } from '../../../domain/analysis/traceability/types';

import { getAnalysisAdapter } from '../../../analysis/adapters/registry';
import { useElementBgVar } from '../../diagram/hooks/useElementBgVar';

import { QuickTooltip } from '../QuickTooltip';
import { measureTextPx, measureWrappedLabel, wrapLabel } from '../graphLabelLayout';

type Props = {
  model: Model;
  modelKind: ModelKind;
  nodesById: Record<string, TraceNode>;
  edgesById: Record<string, TraceEdge>;
  selection: TraceSelection;
  onSelectNode: (id: string) => void;
  onSelectEdge: (id: string) => void;
  onExpandNode: (id: string, direction: 'incoming' | 'outgoing' | 'both') => void;
  onTogglePin: (id: string) => void;
};

function nodeRect() {
  // Base width; height becomes dynamic based on wrapped label (up to 3 lines).
  const w = 190;
  const h = 34;
  return { w, h };
}

function nodeXY(
  node: { level: number; order: number },
  xByLevel: Map<number, number>
) {
  const ySpacing = 74; // allow up to 3 lines of text without overlap
  const marginY = 24;

  const y = marginY + node.order * ySpacing;
  const x = xByLevel.get(node.level) ?? 24;
  return { x, y };
}

function edgePath(from: { x: number; y: number; w: number; h: number }, to: { x: number; y: number; w: number; h: number }) {
  const x1 = from.x + from.w;
  const y1 = from.y + from.h / 2;
  const x2 = to.x;
  const y2 = to.y + to.h / 2;

  const midX = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
}

function stableName(labelForId: (id: string) => string, id: string): string {
  return `${labelForId(id)}\u0000${id}`;
}

export function TraceabilityMiniGraph({ model, modelKind, nodesById, edgesById, selection, onSelectNode, onSelectEdge, onExpandNode, onTogglePin }: Props) {
  const adapter = getAnalysisAdapter(modelKind);
  const { getElementBgVar } = useElementBgVar();

  const [tooltip, setTooltip] = useState<{ x: number; y: number; title: string; lines: string[] } | null>(null);

  const labelForId = useMemo(() => {
    return (id: string): string => {
      const el = model.elements[id];
      return el ? adapter.getNodeLabel(el, model) : '(missing)';
    };
  }, [adapter, model]);

  const renderInlineControls = (nodeId: string, nodeW: number) => {
    const node = nodesById[nodeId];
    if (!node) return null;
    const pinned = Boolean(node.pinned);

    // Controls rendered inside SVG as small button-like groups.
    const btnW = 22;
    const btnH = 18;
    const gap = 6;

    const mkBtn = (x: number, label: string, title: string, onClick: () => void) => (
      <g
        transform={`translate(${x},2)`}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        style={{ cursor: 'pointer' }}
      >
        <rect width={btnW} height={btnH} rx={6} ry={6} fill="rgba(0,0,0,0.08)" stroke="currentColor" strokeOpacity={0.25} />
        <text x={btnW / 2} y={12.5} fontSize={11} textAnchor="middle" fill="currentColor" opacity={0.9}>
          {label}
        </text>
        <title>{title}</title>
      </g>
    );

    return (
      <g transform={`translate(${nodeW - (btnW * 4 + gap * 3) - 8},0)`}>
        {mkBtn(0, '↑', 'Expand upstream', () => onExpandNode(nodeId, 'incoming'))}
        {mkBtn(btnW + gap, '↓', 'Expand downstream', () => onExpandNode(nodeId, 'outgoing'))}
        {mkBtn((btnW + gap) * 2, '↔', 'Expand both', () => onExpandNode(nodeId, 'both'))}
        {mkBtn((btnW + gap) * 3, pinned ? 'P' : 'p', pinned ? 'Unpin' : 'Pin', () => onTogglePin(nodeId))}
      </g>
    );
  };

  const layout = useMemo(() => {
    const nodes = Object.values(nodesById).filter((n) => !n.hidden);
    const edges = Object.values(edgesById);

    const byLevel = new Map<number, string[]>();
    for (const n of nodes) {
      const arr = byLevel.get(n.depth) ?? [];
      arr.push(n.id);
      byLevel.set(n.depth, arr);
    }

    const rect = nodeRect();
    const font = '12px system-ui';

    // 1) Determine per-column (level) width based on wrapped label metrics,
    // bounded to 1.5x base width to keep layout stable.
    const colWByLevel = new Map<number, number>();
    const paddingX = 20; // total (left+right) inside node
    for (const [level, ids] of byLevel.entries()) {
      const maxWrapped = ids.reduce((m, id) => {
        const label = labelForId(id);
        const wrapped = wrapLabel(label, { maxWidthPx: rect.w - paddingX, maxLines: 3, font, measureTextPx });
        const metrics = measureWrappedLabel(wrapped, font, measureTextPx);
        return Math.max(m, metrics.maxLineWidthPx);
      }, 0);

      const desired = maxWrapped + paddingX;
      const bounded = Math.min(rect.w * 1.5, Math.max(rect.w, desired));
      colWByLevel.set(level, bounded);
    }

    // 2) Compute x offsets per level using cumulative widths
    const colGap = 40;
    const marginX = 24;
    const levels = [...byLevel.keys()].sort((a, b) => a - b);
    const xByLevel = new Map<number, number>();
    let xCursor = marginX;
    for (const level of levels) {
      xByLevel.set(level, xCursor);
      xCursor += (colWByLevel.get(level) ?? rect.w) + colGap;
    }

    // 3) Layout nodes within each level
    const yCountByLevel = new Map<number, number>();
    const laidOutNodes: Array<{ id: string; label: string; lines: string[]; level: number; order: number; x: number; y: number; w: number; h: number }> = [];

    for (const [level, ids] of byLevel.entries()) {
      const sorted = [...ids].sort((a, b) => stableName(labelForId, a).localeCompare(stableName(labelForId, b)));
      yCountByLevel.set(level, sorted.length);

      const nodeW = colWByLevel.get(level) ?? rect.w;
      const maxTextW = nodeW - paddingX;

      sorted.forEach((id, order) => {
        const { x, y } = nodeXY({ level, order }, xByLevel);
        const label = labelForId(id);
        const wrapped = wrapLabel(label, { maxWidthPx: maxTextW, maxLines: 3, font, measureTextPx });
        const lines = wrapped.lines;

        const lineHeight = 14;
        const paddingY = 10;
        const h = Math.max(rect.h, paddingY + lines.length * lineHeight + paddingY);

        laidOutNodes.push({ id, label, lines, level, order, x, y, w: nodeW, h });
      });
    }

    const nodePos = new Map<string, { x: number; y: number; w: number; h: number }>();
    for (const n of laidOutNodes) nodePos.set(n.id, { x: n.x, y: n.y, w: n.w, h: n.h });

    const paths: Array<{ id: string; d: string }> = [];
    for (const e of edges) {
      const from = nodePos.get(e.from);
      const to = nodePos.get(e.to);
      if (!from || !to) continue;
      paths.push({ id: e.id, d: edgePath(from, to) });
    }

    const height = Math.max(160, ...laidOutNodes.map((n) => n.y + n.h + 24));
    const width = xCursor + 120; // end padding

    return { nodes: laidOutNodes, paths, width, height };
  }, [edgesById, labelForId, nodesById]);

  const elementTooltip = (elementId: string): { title: string; lines: string[] } | null => {
    const el = model.elements[elementId];
    if (!el) return null;

    const fullLabel = labelForId(elementId);
    const facets = adapter.getNodeFacetValues(el, model);
    const type = String((facets.elementType ?? facets.type ?? el.type) ?? '');
    const layer = String((facets.archimateLayer ?? el.layer) ?? '');
    const doc = String(el.documentation ?? '').trim();

    const lines: string[] = [];
    lines.push(`Id: ${elementId}`);
    if (type) lines.push(`Type: ${type}`);
    if (layer) lines.push(`Layer: ${layer}`);
    if (doc) lines.push(`Documentation: ${doc.length > 240 ? `${doc.slice(0, 239)}…` : doc}`);

    return { title: fullLabel || el.name || '(unnamed)', lines };
  };

  const edgeTooltip = (edgeId: string): { title: string; lines: string[] } | null => {
    const e = edgesById[edgeId];
    if (!e) return null;

    const from = labelForId(e.from);
    const to = labelForId(e.to);

    const rel = e.relationshipId ? model.relationships[e.relationshipId] : undefined;
    const relName = rel?.name ? String(rel.name) : '';
    const relType = rel?.type ? String(rel.type) : (e.type ? String(e.type) : 'Relationship');
    const relDoc = String(rel?.documentation ?? '').trim();

    const title = relName ? `${relType} — ${relName}` : relType;
    const lines: string[] = [`From: ${from}`, `To: ${to}`];
    if (e.relationshipId) lines.push(`Id: ${e.relationshipId}`);
    if (relDoc) lines.push(`Documentation: ${relDoc.length > 240 ? `${relDoc.slice(0, 239)}…` : relDoc}`);

    return { title, lines };
  };

  return (
    <div className="crudSection" style={{ marginTop: 14 }}>
      <div className="crudHeader">
        <div>
          <p className="crudTitle">Traceability graph</p>
          <p className="crudHint">Click nodes/edges to select. Use the controls above to expand.</p>
        </div>
      </div>

      <div style={{ border: '1px solid var(--border-1)', borderRadius: 12, overflow: 'auto' }}>
        <svg width={layout.width} height={layout.height} role="img" aria-label="Traceability mini graph">
          <defs>
            <marker id="traceArrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
            </marker>
          </defs>

          {layout.paths.map((p) => {
            const active = selection.selectedEdgeId === p.id;
            return (
              <path
                key={p.id}
                d={p.d}
                fill="none"
                stroke="currentColor"
                opacity={active ? 0.95 : 0.35}
                strokeWidth={active ? 2.2 : 1.2}
                markerEnd="url(#traceArrow)"
                onMouseMove={(e) => {
                  const t = edgeTooltip(p.id);
                  if (!t) return;
                  setTooltip({ x: e.clientX + 12, y: e.clientY + 12, title: t.title, lines: t.lines });
                }}
                onMouseLeave={() => setTooltip(null)}
                onClick={() => onSelectEdge(p.id)}
                style={{ cursor: 'pointer' }}
              />
            );
          })}

          {layout.nodes.map((n) => {
            const el = model.elements[n.id];
            const facets = el ? adapter.getNodeFacetValues(el, model) : {};
            const et = (facets.elementType ?? facets.type ?? el?.type) as unknown as ElementType | undefined;
            const bg = et ? getElementBgVar(et) : 'var(--arch-layer-business)';
            const active = selection.selectedNodeId === n.id;
            return (
              <g
                key={n.id}
                transform={`translate(${n.x},${n.y})`}
                onMouseMove={(e) => {
                  const tip = elementTooltip(n.id);
                  if (!tip) return;
                  setTooltip({ x: e.clientX + 12, y: e.clientY + 12, title: tip.title, lines: tip.lines });
                }}
                onMouseLeave={() => setTooltip(null)}
                onClick={() => onSelectNode(n.id)}
                style={{ cursor: 'pointer' }}
              >
                <rect
                  width={n.w}
                  height={n.h}
                  rx={10}
                  ry={10}
                  fill={bg}
                  opacity={0.22}
                  stroke="currentColor"
                  strokeOpacity={active ? 0.9 : 0.25}
                  strokeWidth={active ? 2.2 : 1}
                />
                <text x={10} y={18} fontSize={12} fill="currentColor" opacity={0.9}>
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
                </text>
                {active ? renderInlineControls(n.id, n.w) : null}
              </g>
            );
          })}
        </svg>
      </div>

      {tooltip ? (
        <QuickTooltip
          open={true}
          x={tooltip.x}
          y={tooltip.y}
          title={tooltip.title}
          lines={tooltip.lines}
          onClose={() => setTooltip(null)}
        />
      ) : null}
    </div>
  );
}

import { useMemo, useState } from 'react';

import type { ElementType, Model } from '../../../domain';
import type { ModelKind } from '../../../domain/types';
import type { TraceEdge, TraceNode, TraceSelection } from '../../../domain/analysis/traceability/types';

import { getAnalysisAdapter } from '../../../analysis/adapters/registry';
import { useElementBgVar } from '../../diagram/hooks/useElementBgVar';

import { QuickTooltip } from '../QuickTooltip';

type Props = {
  model: Model;
  modelKind: ModelKind;
  nodesById: Record<string, TraceNode>;
  edgesById: Record<string, TraceEdge>;
  selection: TraceSelection;
  onSelectNode: (id: string) => void;
  onSelectEdge: (id: string) => void;
};

function nodeRect() {
  const w = 170;
  const h = 34;
  return { w, h };
}

function nodeXY(node: { level: number; order: number }, yCountByLevel: Map<number, number>) {
  const xSpacing = 220;
  const ySpacing = 56;
  const marginX = 24;
  const marginY = 24;

  const count = yCountByLevel.get(node.level) ?? 1;
  const totalH = Math.max(1, count) * ySpacing;
  const baseY = marginY;
  const y = baseY + node.order * ySpacing;

  const x = marginX + node.level * xSpacing;
  return { x, y, totalH };
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

export function TraceabilityMiniGraph({ model, modelKind, nodesById, edgesById, selection, onSelectNode, onSelectEdge }: Props) {
  const adapter = getAnalysisAdapter(modelKind);
  const { getElementBgVar } = useElementBgVar();

  const [tooltip, setTooltip] = useState<{ x: number; y: number; title: string; lines: string[] } | null>(null);

  const labelForId = useMemo(() => {
    return (id: string): string => {
      const el = model.elements[id];
      return el ? adapter.getNodeLabel(el, model) : '(missing)';
    };
  }, [adapter, model]);

  const layout = useMemo(() => {
    const nodes = Object.values(nodesById).filter((n) => !n.hidden);
    const edges = Object.values(edgesById);

    const byLevel = new Map<number, string[]>();
    for (const n of nodes) {
      const arr = byLevel.get(n.depth) ?? [];
      arr.push(n.id);
      byLevel.set(n.depth, arr);
    }

    const laidOutNodes: Array<{ id: string; label: string; level: number; order: number; x: number; y: number; w: number; h: number }> = [];
    const rect = nodeRect();

    const yCountByLevel = new Map<number, number>();
    for (const [level, ids] of byLevel.entries()) {
      const sorted = [...ids].sort((a, b) => stableName(labelForId, a).localeCompare(stableName(labelForId, b)));
      yCountByLevel.set(level, sorted.length);
      sorted.forEach((id, order) => {
        const { x, y } = nodeXY({ level, order }, yCountByLevel);
        laidOutNodes.push({ id, label: labelForId(id), level, order, x, y, w: rect.w, h: rect.h });
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

    const maxLevel = Math.max(0, ...laidOutNodes.map((n) => n.level));
    const heightByLevel = new Map<number, number>();
    for (const [lvl, count] of yCountByLevel.entries()) heightByLevel.set(lvl, 24 + count * 56 + 24);

    const height = Math.max(160, ...Array.from(heightByLevel.values()));
    const width = 24 + (maxLevel + 1) * 220 + 200;

    return { nodes: laidOutNodes, paths, width, height };
  }, [edgesById, labelForId, nodesById]);

  const elementTooltip = (elementId: string): { title: string; lines: string[] } | null => {
    const el = model.elements[elementId];
    if (!el) return null;
    const facets = adapter.getNodeFacetValues(el, model);
    const type = String((facets.elementType ?? facets.type ?? el.type) ?? '');
    const layer = String((facets.archimateLayer ?? el.layer) ?? '');
    const doc = String((el.documentation ?? '')).trim();
    const lines: string[] = [];
    if (type) lines.push(`Type: ${type}`);
    if (layer) lines.push(`Layer: ${layer}`);
    if (doc) lines.push(`Documentation: ${doc.length > 240 ? `${doc.slice(0, 239)}…` : doc}`);
    return { title: el.name || '(unnamed)', lines };
  };

  const edgeTooltip = (edgeId: string): { title: string; lines: string[] } | null => {
    const e = edgesById[edgeId];
    if (!e) return null;
    const from = labelForId(e.from);
    const to = labelForId(e.to);
    const title = e.type ? String(e.type) : 'Relationship';
    const lines = [`From: ${from}`, `To: ${to}`];
    if (e.relationshipId) lines.push(`Id: ${e.relationshipId}`);
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
                <text x={10} y={22} fontSize={12} fill="currentColor" opacity={0.9}>
                  {n.label || '(unnamed)'}
                </text>
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

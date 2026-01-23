import { useMemo } from 'react';
import type { CSSProperties } from 'react';

import type { ElementType, Model } from '../../../domain';
import type { ModelKind } from '../../../domain/types';
import type { TraceEdge, TraceNode, TraceSelection } from '../../../domain/analysis/traceability/types';

import { getAnalysisAdapter } from '../../../analysis/adapters/registry';
import { useElementBgVar } from '../../diagram/hooks/useElementBgVar';

import type { MiniColumnGraphTooltip } from '../MiniColumnGraph';
import { MiniColumnGraph } from '../MiniColumnGraph';

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

  wrapLabels?: boolean;
  autoFitColumns?: boolean;
};

export function TraceabilityMiniGraph({
  model,
  modelKind,
  nodesById,
  edgesById,
  selection,
  onSelectNode,
  onSelectEdge,
  onExpandNode,
  onTogglePin,
  wrapLabels = true,
  autoFitColumns = true
}: Props) {
  const adapter = getAnalysisAdapter(modelKind);
  const { getElementBgVar } = useElementBgVar();

  const labelForId = (id: string) => {
    const el = model.elements[id];
    if (!el) return id;
    const name = String(el.name ?? '').trim();
    return name || id;
  };

  const elementTooltip = (elementId: string): MiniColumnGraphTooltip | null => {
    const el = model.elements[elementId];
    if (!el) return null;

    const fullLabel = labelForId(elementId);
    const facets = adapter.getNodeFacetValues(el, model);
    const type = String((facets.elementType ?? facets.type ?? el.type) ?? '');
    const layer = String((facets.archimateLayer ?? (el as unknown as { layer?: string }).layer) ?? '');
    const doc = String(el.documentation ?? '').trim();

    const lines: string[] = [];
    lines.push(`Id: ${elementId}`);
    if (type) lines.push(`Type: ${type}`);
    if (layer) lines.push(`Layer: ${layer}`);
    if (doc) lines.push(`Documentation: ${doc.length > 240 ? `${doc.slice(0, 239)}…` : doc}`);

    return { title: fullLabel || String(el.name ?? '') || '(unnamed)', lines };
  };

  const edgeTooltip = (edgeId: string): MiniColumnGraphTooltip | null => {
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

  const renderInlineControls = (nodeId: string, nodeWidth: number) => {
    const node = nodesById[nodeId];
    if (!node) return null;

    const iconStyle: CSSProperties = {
      width: 18,
      height: 18,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 6,
      border: '1px solid rgba(0,0,0,0.22)',
      background: 'rgba(255,255,255,0.75)',
      cursor: 'pointer',
      userSelect: 'none'
    };

    return (
      <g transform={`translate(${Math.max(10, nodeWidth - 10 - 4 * 24)},${8})`}>
        <foreignObject width={4 * 24} height={22}>
          <div style={{ display: 'flex', gap: 6 }}>
            <div
              style={iconStyle}
              title="Expand incoming"
              onClick={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                onExpandNode(nodeId, 'incoming');
              }}
            >
              ←
            </div>
            <div
              style={iconStyle}
              title="Expand outgoing"
              onClick={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                onExpandNode(nodeId, 'outgoing');
              }}
            >
              →
            </div>
            <div
              style={iconStyle}
              title="Expand both"
              onClick={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                onExpandNode(nodeId, 'both');
              }}
            >
              ⇄
            </div>
            <div
              style={{
                ...iconStyle,
                fontWeight: node.pinned ? 700 : 400
              }}
              title={node.pinned ? 'Unpin' : 'Pin'}
              onClick={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                onTogglePin(nodeId);
              }}
            >
              📌
            </div>
          </div>
        </foreignObject>
      </g>
    );
  };

  const graphNodes = useMemo(() => {
    const list: Array<{ id: string; label: string; level: number; bg?: string; hidden?: boolean }> = [];
    for (const n of Object.values(nodesById)) {
      const label = labelForId(n.id);
      const el = model.elements[n.id];
      const facets = el ? adapter.getNodeFacetValues(el, model) : {};
      const et = (facets.elementType ?? facets.type ?? el?.type) as unknown as ElementType | undefined;
      const bg = et ? getElementBgVar(et) : 'var(--arch-layer-business)';
      list.push({ id: n.id, label, level: n.depth, bg, hidden: n.hidden });
    }
    return list;
  }, [adapter, getElementBgVar, model, nodesById]);

  const graphEdges = useMemo(() => {
    return Object.values(edgesById).map((e) => ({ id: e.id, from: e.from, to: e.to, hidden: e.hidden }));
  }, [edgesById]);

  return (
    <div className="crudSection" style={{ marginTop: 14 }}>
      <div className="crudHeader">
        <div>
          <p className="crudTitle">Traceability graph</p>
          <p className="crudHint">Click nodes/edges to select. Use the controls above to expand.</p>
        </div>
      </div>

      <MiniColumnGraph
        nodes={graphNodes}
        edges={graphEdges}
        selectedNodeId={selection.selectedNodeId}
        selectedEdgeId={selection.selectedEdgeId}
        onSelectNode={onSelectNode}
        onSelectEdge={onSelectEdge}
        getNodeTooltip={elementTooltip}
        getEdgeTooltip={edgeTooltip}
        renderNodeControls={renderInlineControls}
        wrapLabels={wrapLabels}
        autoFitColumns={autoFitColumns}
        ariaLabel="Traceability mini graph"
      />
    </div>
  );
}

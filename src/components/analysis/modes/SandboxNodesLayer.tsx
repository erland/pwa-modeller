import type { MouseEvent, PointerEvent } from 'react';
import { useMemo } from 'react';

import type { Model } from '../../../domain';
import { kindFromTypeId } from '../../../domain';
import { getNotation } from '../../../notations';

import { SANDBOX_NODE_H, SANDBOX_NODE_W } from './sandboxConstants';

export function SandboxNodesLayer({
  model,
  nodes,
  selectedElementId,
  pairAnchors,
  overlayBadgeByElementId,
  overlayScaleByElementId,
  onPointerDownNode,
  onClickNode,
  onDoubleClickNode,
}: {
  model: Model;
  nodes: Array<{ elementId: string; x: number; y: number }>;
  selectedElementId: string | null;
  pairAnchors: string[];
  overlayBadgeByElementId: Record<string, string> | null;
  overlayScaleByElementId: Record<string, number> | null;
  onPointerDownNode: (e: PointerEvent<SVGGElement>, elementId: string) => void;
  onClickNode: (e: MouseEvent<SVGGElement>, elementId: string) => void;
  onDoubleClickNode: (elementId: string) => void;
}) {
  // The model can contain mixed notations (e.g. ArchiMate + UML + BPMN) via qualified type ids.
  // Infer the notation per element using its type prefix rather than relying on a global model kind.
  const archimateNotation = useMemo(() => getNotation('archimate'), []);
  const umlNotation = useMemo(() => getNotation('uml'), []);
  const bpmnNotation = useMemo(() => getNotation('bpmn'), []);

  return (
    <>
      {nodes.map((n) => {
        const el = model.elements[n.elementId];
        if (!el) return null;
        const isSelected = selectedElementId === n.elementId;
        const isPairPrimary = pairAnchors[0] === n.elementId;
        const isPairSecondary = pairAnchors[1] === n.elementId;
        const label = el.name || '(unnamed)';
        const secondary = el.type;
        const kind = kindFromTypeId(String(el.type));
        const notation = kind === 'uml' ? umlNotation : kind === 'bpmn' ? bpmnNotation : archimateNotation;
        const bgVar = notation.getElementBgVar(String(el.type));

        const badge = overlayBadgeByElementId ? overlayBadgeByElementId[n.elementId] : undefined;
        const scale = overlayScaleByElementId ? overlayScaleByElementId[n.elementId] : 1;
        const cx = SANDBOX_NODE_W / 2;
        const cy = SANDBOX_NODE_H / 2;

        return (
          <g
            key={n.elementId}
            className={`analysisSandboxNode ${isSelected ? 'isSelected' : ''} ${
              isPairPrimary || isPairSecondary ? 'isPairSelected' : ''
            } ${isPairPrimary ? 'isPairPrimary' : ''} ${isPairSecondary ? 'isPairSecondary' : ''}`}
            transform={`translate(${n.x}, ${n.y})`}
            data-element-id={n.elementId}
            data-element-type={String(el.type)}
            onPointerDown={(e) => onPointerDownNode(e, n.elementId)}
            onDoubleClick={() => onDoubleClickNode(n.elementId)}
            onClick={(e) => onClickNode(e, n.elementId)}
            role="button"
            tabIndex={0}
            aria-label={label}
          >
            <g transform={scale !== 1 ? `translate(${cx}, ${cy}) scale(${scale}) translate(${-cx}, ${-cy})` : undefined}>
              <rect width={SANDBOX_NODE_W} height={SANDBOX_NODE_H} rx={8} ry={8} style={{ fill: bgVar }} />
              <text x={10} y={22} className="analysisSandboxNodeTitle">
                {label}
              </text>
              <text x={10} y={42} className="analysisSandboxNodeMeta">
                {secondary}
              </text>

              {badge ? (
                <g className="analysisSandboxNodeBadge" aria-label="Overlay badge" pointerEvents="none">
                  <circle cx={SANDBOX_NODE_W - 14} cy={14} r={10} fill="rgba(0,0,0,0.55)" />
                  <text
                    x={SANDBOX_NODE_W - 14}
                    y={18}
                    textAnchor="middle"
                    fontFamily="system-ui, -apple-system, Segoe UI, Roboto, Arial"
                    fontSize={10}
                    fontWeight={800}
                    fill="white"
                  >
                    {badge}
                  </text>
                </g>
              ) : null}
            </g>
          </g>
        );
      })}
    </>
  );
}

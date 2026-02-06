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
  onPointerDownNode,
  onClickNode,
  onDoubleClickNode,
}: {
  model: Model;
  nodes: Array<{ elementId: string; x: number; y: number }>;
  selectedElementId: string | null;
  pairAnchors: string[];
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
            <rect width={SANDBOX_NODE_W} height={SANDBOX_NODE_H} rx={8} ry={8} style={{ fill: bgVar }} />
            <text x={10} y={22} className="analysisSandboxNodeTitle">
              {label}
            </text>
            <text x={10} y={42} className="analysisSandboxNodeMeta">
              {secondary}
            </text>
          </g>
        );
      })}
    </>
  );
}

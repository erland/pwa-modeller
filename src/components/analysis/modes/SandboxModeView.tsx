import { useCallback, useMemo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';

import type { Model } from '../../../domain';
import type { Selection } from '../../model/selection';
import type { SandboxNode } from '../workspace/controller/useSandboxState';

import '../../../styles/analysisSandbox.css';

const NODE_W = 180;
const NODE_H = 56;

type DragState = {
  elementId: string;
  offsetX: number;
  offsetY: number;
};

function getSelectedElementId(selection: Selection): string | null {
  switch (selection.kind) {
    case 'element':
      return selection.elementId;
    case 'viewNode':
      return selection.elementId;
    case 'viewNodes':
      return selection.elementIds[0] ?? null;
    default:
      return null;
  }
}

function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: clientX, y: clientY };
  const sp = pt.matrixTransform(ctm.inverse());
  return { x: sp.x, y: sp.y };
}

export function SandboxModeView({
  model,
  nodes,
  selection,
  onSelectElement,
  onMoveNode,
}: {
  model: Model;
  nodes: SandboxNode[];
  selection: Selection;
  onSelectElement: (elementId: string) => void;
  onMoveNode: (elementId: string, x: number, y: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const selectedElementId = useMemo(() => getSelectedElementId(selection), [selection]);

  const nodeById = useMemo(() => {
    const m = new Map<string, SandboxNode>();
    for (const n of nodes) m.set(n.elementId, n);
    return m;
  }, [nodes]);

  const visibleRelationships = useMemo(() => {
    const ids = new Set(nodes.map((n) => n.elementId));
    const rels = Object.values(model.relationships).filter((r) => {
      if (!r.sourceElementId || !r.targetElementId) return false;
      return ids.has(r.sourceElementId) && ids.has(r.targetElementId);
    });
    // Stable ordering for predictable rendering
    return rels.sort((a, b) => a.id.localeCompare(b.id));
  }, [model.relationships, nodes]);

  const onPointerDownNode = useCallback(
    (e: PointerEvent<SVGGElement>, elementId: string) => {
      const svg = svgRef.current;
      if (!svg) return;
      const node = nodeById.get(elementId);
      if (!node) return;
      const p = clientToSvg(svg, e.clientX, e.clientY);
      setDrag({ elementId, offsetX: p.x - node.x, offsetY: p.y - node.y });
      (e.currentTarget as SVGGElement).setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    [nodeById]
  );

  const onPointerMove = useCallback(
    (e: PointerEvent<SVGSVGElement>) => {
      if (!drag) return;
      const svg = svgRef.current;
      if (!svg) return;
      const p = clientToSvg(svg, e.clientX, e.clientY);
      const nx = p.x - drag.offsetX;
      const ny = p.y - drag.offsetY;
      onMoveNode(drag.elementId, nx, ny);
      e.preventDefault();
    },
    [drag, onMoveNode]
  );

  const onPointerUp = useCallback(
    (e: PointerEvent<SVGSVGElement>) => {
      if (!drag) return;
      setDrag(null);
      try {
        (e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    },
    [drag]
  );

  if (!nodes.length) {
    return (
      <div className="crudSection">
        <div className="crudHeader">
          <div>
            <p className="crudTitle">Sandbox</p>
            <p className="crudHint">
              Select an element and switch to Sandbox to start. (Step 2 will add drag-and-drop from the navigator.)
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="analysisSandboxRoot" aria-label="Analysis sandbox">
      <svg
        ref={svgRef}
        className="analysisSandboxSvg"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        role="img"
        aria-label="Sandbox canvas"
      >
        <defs>
          <marker
            id="sandboxArrow"
            viewBox="0 0 10 10"
            refX="10"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" />
          </marker>
        </defs>

        {visibleRelationships.map((r) => {
          const sId = r.sourceElementId as string;
          const tId = r.targetElementId as string;
          const s = nodeById.get(sId);
          const t = nodeById.get(tId);
          if (!s || !t) return null;
          const x1 = s.x + NODE_W / 2;
          const y1 = s.y + NODE_H / 2;
          const x2 = t.x + NODE_W / 2;
          const y2 = t.y + NODE_H / 2;
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          return (
            <g key={r.id} className="analysisSandboxEdge">
              <line x1={x1} y1={y1} x2={x2} y2={y2} markerEnd="url(#sandboxArrow)" />
              <text x={mx} y={my - 6} textAnchor="middle">
                {r.type}
              </text>
            </g>
          );
        })}

        {nodes.map((n) => {
          const el = model.elements[n.elementId];
          if (!el) return null;
          const isSelected = selectedElementId === n.elementId;
          const label = el.name || '(unnamed)';
          const secondary = el.type;

          return (
            <g
              key={n.elementId}
              className={`analysisSandboxNode ${isSelected ? 'isSelected' : ''}`}
              transform={`translate(${n.x}, ${n.y})`}
              onPointerDown={(e) => onPointerDownNode(e, n.elementId)}
              onDoubleClick={() => onSelectElement(n.elementId)}
              onClick={() => onSelectElement(n.elementId)}
              role="button"
              tabIndex={0}
              aria-label={label}
            >
              <rect width={NODE_W} height={NODE_H} rx={8} ry={8} />
              <text x={10} y={22} className="analysisSandboxNodeTitle">
                {label}
              </text>
              <text x={10} y={42} className="analysisSandboxNodeMeta">
                {secondary}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

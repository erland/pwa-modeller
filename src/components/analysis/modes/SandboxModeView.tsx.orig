import { useCallback, useMemo, useRef, useState } from 'react';
import type { DragEvent, PointerEvent } from 'react';

import type { Model } from '../../../domain';
import type { Selection } from '../../model/selection';
import type { SandboxNode } from '../workspace/controller/useSandboxState';

import { dataTransferHasElement, readDraggedElementId } from '../../diagram/dragDrop';

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
  selectionElementIds,
  onSelectElement,
  onMoveNode,
  onAddSelected,
  onRemoveSelected,
  onClear,
  onAddNodeAt,
}: {
  model: Model;
  nodes: SandboxNode[];
  selection: Selection;
  selectionElementIds: string[];
  onSelectElement: (elementId: string) => void;
  onMoveNode: (elementId: string, x: number, y: number) => void;
  onAddSelected: () => void;
  onRemoveSelected: () => void;
  onClear: () => void;
  onAddNodeAt: (elementId: string, x: number, y: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [isDropTarget, setIsDropTarget] = useState(false);

  const selectedElementId = useMemo(() => getSelectedElementId(selection), [selection]);

  const nodeById = useMemo(() => {
    const m = new Map<string, SandboxNode>();
    for (const n of nodes) m.set(n.elementId, n);
    return m;
  }, [nodes]);

  const canAddSelected = useMemo(() => {
    for (const id of selectionElementIds) {
      if (!model.elements[id]) continue;
      if (!nodeById.has(id)) return true;
    }
    return false;
  }, [model.elements, nodeById, selectionElementIds]);

  const canRemoveSelected = useMemo(() => {
    for (const id of selectionElementIds) {
      if (nodeById.has(id)) return true;
    }
    return false;
  }, [nodeById, selectionElementIds]);

  const visibleRelationships = useMemo(() => {
    const ids = new Set(nodes.map((n) => n.elementId));
    const rels = Object.values(model.relationships).filter((r) => {
      if (!r.sourceElementId || !r.targetElementId) return false;
      return ids.has(r.sourceElementId) && ids.has(r.targetElementId);
    });
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

  const onDragOver = useCallback((e: DragEvent<SVGSVGElement>) => {
    if (!dataTransferHasElement(e.dataTransfer)) return;
    e.preventDefault();
    setIsDropTarget(true);
  }, []);

  const onDragLeave = useCallback(() => {
    setIsDropTarget(false);
  }, []);

  const onDrop = useCallback(
    (e: DragEvent<SVGSVGElement>) => {
      setIsDropTarget(false);
      if (!dataTransferHasElement(e.dataTransfer)) return;
      e.preventDefault();

      const id = readDraggedElementId(e.dataTransfer);
      if (!id) return;
      if (!model.elements[id]) return;

      const svg = svgRef.current;
      if (!svg) return;
      const p = clientToSvg(svg, e.clientX, e.clientY);
      const x = p.x - NODE_W / 2;
      const y = p.y - NODE_H / 2;
      onAddNodeAt(id, x, y);
      onSelectElement(id);
    },
    [model.elements, onAddNodeAt, onSelectElement]
  );

  return (
    <div className="crudSection">
      <div className="crudHeader">
        <div>
          <p className="crudTitle">Sandbox</p>
          <p className="crudHint">
            Drag elements from the Model Navigator into the canvas, or use the buttons to add and remove the current
            selection.
          </p>
        </div>
        <div className="rowActions">
          <button
            type="button"
            className="miniLinkButton"
            onClick={onAddSelected}
            disabled={!canAddSelected}
            aria-disabled={!canAddSelected}
            title="Add the currently selected element(s) to the sandbox"
          >
            Add selected
          </button>
          <button
            type="button"
            className="miniLinkButton"
            onClick={onRemoveSelected}
            disabled={!canRemoveSelected}
            aria-disabled={!canRemoveSelected}
            title="Remove the currently selected element(s) from the sandbox"
          >
            Remove selected
          </button>
          <button
            type="button"
            className="miniLinkButton"
            onClick={onClear}
            disabled={!nodes.length}
            aria-disabled={!nodes.length}
            title="Clear all sandbox nodes"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="analysisSandboxRoot" aria-label="Analysis sandbox">
        <svg
          ref={svgRef}
          className={`analysisSandboxSvg ${isDropTarget ? 'isDropTarget' : ''}`}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
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

          {!nodes.length ? (
            <g className="analysisSandboxEmpty">
              <text x="50%" y="45%" textAnchor="middle">
                Drop elements here
              </text>
              <text x="50%" y="55%" textAnchor="middle">
                Tip: you can also select an element and press “Add selected”
              </text>
            </g>
          ) : null}

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
    </div>
  );
}

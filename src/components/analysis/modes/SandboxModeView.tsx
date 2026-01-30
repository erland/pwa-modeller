import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, PointerEvent } from 'react';

import type { Model } from '../../../domain';
import type { Selection } from '../../model/selection';
import type {
  SandboxNode,
  SandboxAddRelatedDirection,
  SandboxRelationshipVisibilityMode,
  SandboxRelationshipsState,
  SandboxState,
} from '../workspace/controller/useSandboxState';

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
  relationships,
  addRelated,
  selection,
  selectionElementIds,
  onSelectElement,
  onMoveNode,
  onAddSelected,
  onRemoveSelected,
  onClear,
  onAddNodeAt,
  onSetShowRelationships,
  onSetRelationshipMode,
  onSetEnabledRelationshipTypes,
  onToggleEnabledRelationshipType,
  onSetAddRelatedDepth,
  onSetAddRelatedDirection,
  onSetAddRelatedEnabledTypes,
  onToggleAddRelatedEnabledType,
  onAddRelatedFromSelection,
}: {
  model: Model;
  nodes: SandboxNode[];
  relationships: SandboxRelationshipsState;
  addRelated: SandboxState['addRelated'];
  selection: Selection;
  selectionElementIds: string[];
  onSelectElement: (elementId: string) => void;
  onMoveNode: (elementId: string, x: number, y: number) => void;
  onAddSelected: () => void;
  onRemoveSelected: () => void;
  onClear: () => void;
  onAddNodeAt: (elementId: string, x: number, y: number) => void;
  onSetShowRelationships: (show: boolean) => void;
  onSetRelationshipMode: (mode: SandboxRelationshipVisibilityMode) => void;
  onSetEnabledRelationshipTypes: (types: string[]) => void;
  onToggleEnabledRelationshipType: (type: string) => void;
  onSetAddRelatedDepth: (depth: number) => void;
  onSetAddRelatedDirection: (direction: SandboxAddRelatedDirection) => void;
  onSetAddRelatedEnabledTypes: (types: string[]) => void;
  onToggleAddRelatedEnabledType: (type: string) => void;
  onAddRelatedFromSelection: (anchorElementIds: string[]) => void;
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

  const allRelationshipTypes = useMemo(() => {
    const set = new Set<string>();
    for (const r of Object.values(model.relationships)) {
      if (!r.type) continue;
      set.add(r.type);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [model.relationships]);

  const addRelatedEnabledTypeSet = useMemo(() => new Set(addRelated.enabledTypes), [addRelated.enabledTypes]);

  const addRelatedSelectedTypeCount = useMemo(() => {
    if (allRelationshipTypes.length === 0) return 0;
    return allRelationshipTypes.filter((t) => addRelatedEnabledTypeSet.has(t)).length;
  }, [addRelatedEnabledTypeSet, allRelationshipTypes]);

  const addRelatedAnchors = useMemo(() => {
    return selectionElementIds.filter((id) => nodeById.has(id));
  }, [nodeById, selectionElementIds]);

  const canAddRelated = useMemo(() => {
    return addRelatedAnchors.length > 0 && addRelated.enabledTypes.length > 0;
  }, [addRelated.enabledTypes.length, addRelatedAnchors.length]);
  const baseVisibleRelationships = useMemo(() => {
    const ids = new Set(nodes.map((n) => n.elementId));
    const rels = Object.values(model.relationships).filter((r) => {
      if (!r.sourceElementId || !r.targetElementId) return false;
      return ids.has(r.sourceElementId) && ids.has(r.targetElementId);
    });
    return rels.sort((a, b) => a.id.localeCompare(b.id));
  }, [model.relationships, nodes]);

  const availableRelationshipTypes = useMemo(() => {
    const set = new Set<string>();
    for (const r of baseVisibleRelationships) set.add(r.type);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [baseVisibleRelationships]);

  const enabledTypeSet = useMemo(() => new Set(relationships.enabledTypes), [relationships.enabledTypes]);

  // When switching to type filtering, default to enabling all available types.
  useEffect(() => {
    if (!relationships.show) return;
    if (relationships.mode !== 'types') return;
    if (relationships.enabledTypes.length > 0) return;
    if (availableRelationshipTypes.length === 0) return;
    onSetEnabledRelationshipTypes(availableRelationshipTypes);
  }, [
    availableRelationshipTypes,
    onSetEnabledRelationshipTypes,
    relationships.enabledTypes.length,
    relationships.mode,
    relationships.show,
  ]);

  const selectedTypeCount = useMemo(() => {
    if (availableRelationshipTypes.length === 0) return 0;
    return availableRelationshipTypes.filter((t) => enabledTypeSet.has(t)).length;
  }, [availableRelationshipTypes, enabledTypeSet]);

  const visibleRelationships = useMemo(() => {
    if (!relationships.show) return [];
    if (relationships.mode === 'all') return baseVisibleRelationships;
    return baseVisibleRelationships.filter((r) => enabledTypeSet.has(r.type));
  }, [baseVisibleRelationships, enabledTypeSet, relationships.mode, relationships.show]);

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

      <div className="toolbar" style={{ marginTop: 10 }}>
        <div className="toolbarGroup" style={{ minWidth: 240 }}>
          <label>Relationships</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.9 }}>
            <input
              type="checkbox"
              checked={relationships.show}
              onChange={(e) => onSetShowRelationships(e.currentTarget.checked)}
            />
            <span>Show relationships</span>
          </label>
          {relationships.show ? (
            <select
              className="selectInput"
              value={relationships.mode}
              onChange={(e) => onSetRelationshipMode(e.currentTarget.value as SandboxRelationshipVisibilityMode)}
              aria-label="Relationship visibility mode"
            >
              <option value="all">All</option>
              <option value="types">Filter by type</option>
            </select>
          ) : null}
          <p className="crudHint" style={{ margin: 0 }}>
            {relationships.show
              ? `${baseVisibleRelationships.length} relationships between ${nodes.length} node(s)`
              : 'Relationships are hidden'}
          </p>
        </div>

        {relationships.show && relationships.mode === 'types' ? (
          <div className="toolbarGroup" style={{ minWidth: 260, flex: '1 1 260px' }}>
            <label>
              Types ({selectedTypeCount}/{availableRelationshipTypes.length})
            </label>
            <div
              style={{
                maxHeight: 160,
                overflow: 'auto',
                border: '1px solid var(--border-1)',
                borderRadius: 10,
                padding: '8px 10px',
                background: 'rgba(255,255,255,0.02)',
              }}
            >
              {availableRelationshipTypes.length === 0 ? (
                <p className="crudHint" style={{ margin: 0 }}>
                  No relationships found between sandbox nodes.
                </p>
              ) : (
                availableRelationshipTypes.map((t) => (
                  <label
                    key={t}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.9, marginBottom: 6 }}
                  >
                    <input
                      type="checkbox"
                      checked={enabledTypeSet.has(t)}
                      onChange={() => onToggleEnabledRelationshipType(t)}
                    />
                    <span title={t}>{t}</span>
                  </label>
                ))
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="miniLinkButton"
                onClick={() => onSetEnabledRelationshipTypes(availableRelationshipTypes)}
                disabled={availableRelationshipTypes.length === 0}
                aria-disabled={availableRelationshipTypes.length === 0}
              >
                All
              </button>
              <button type="button" className="miniLinkButton" onClick={() => onSetEnabledRelationshipTypes([])}>
                None
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="toolbar" style={{ marginTop: 10 }}>
        <div className="toolbarGroup" style={{ minWidth: 260 }}>
          <label>Add related elements</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ fontSize: 12, opacity: 0.9 }}>
              Depth
              <input
                type="number"
                min={1}
                max={6}
                value={addRelated.depth}
                onChange={(e) => onSetAddRelatedDepth(Number(e.currentTarget.value))}
                style={{ width: 70, marginLeft: 8 }}
              />
            </label>
            <label style={{ fontSize: 12, opacity: 0.9 }}>
              Direction
              <select
                className="selectInput"
                value={addRelated.direction}
                onChange={(e) => onSetAddRelatedDirection(e.currentTarget.value as SandboxAddRelatedDirection)}
                style={{ marginLeft: 8 }}
                aria-label="Add related direction"
              >
                <option value="both">Both</option>
                <option value="outgoing">Outgoing</option>
                <option value="incoming">Incoming</option>
              </select>
            </label>
            <button
              type="button"
              className="miniLinkButton"
              onClick={() => onAddRelatedFromSelection(addRelatedAnchors)}
              disabled={!canAddRelated}
              aria-disabled={!canAddRelated}
              title={addRelatedAnchors.length ? 'Add related elements around the selected sandbox node(s)' : 'Select one or more sandbox nodes to expand'}
            >
              Add related
            </button>
          </div>
          <p className="crudHint" style={{ margin: 0 }}>
            {addRelatedAnchors.length === 0
              ? 'Select a sandbox node to expand.'
              : `Anchors: ${addRelatedAnchors.length} · Types: ${addRelatedSelectedTypeCount}/${allRelationshipTypes.length}`}
          </p>
        </div>

        <div className="toolbarGroup" style={{ minWidth: 260, flex: '1 1 260px' }}>
          <label>
            Traversal types ({addRelatedSelectedTypeCount}/{allRelationshipTypes.length})
          </label>
          <div
            style={{
              maxHeight: 160,
              overflow: 'auto',
              border: '1px solid var(--border-1)',
              borderRadius: 10,
              padding: '8px 10px',
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            {allRelationshipTypes.length === 0 ? (
              <p className="crudHint" style={{ margin: 0 }}>
                This model has no relationships.
              </p>
            ) : (
              allRelationshipTypes.map((t) => (
                <label
                  key={t}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.9, marginBottom: 6 }}
                >
                  <input type="checkbox" checked={addRelatedEnabledTypeSet.has(t)} onChange={() => onToggleAddRelatedEnabledType(t)} />
                  <span title={t}>{t}</span>
                </label>
              ))
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="miniLinkButton"
              onClick={() => onSetAddRelatedEnabledTypes(allRelationshipTypes)}
              disabled={allRelationshipTypes.length === 0}
              aria-disabled={allRelationshipTypes.length === 0}
            >
              All
            </button>
            <button type="button" className="miniLinkButton" onClick={() => onSetAddRelatedEnabledTypes([])}>
              None
            </button>
          </div>
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

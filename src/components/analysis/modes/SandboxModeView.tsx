import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, MouseEvent, PointerEvent } from 'react';

import type { Model, ViewNodeLayout } from '../../../domain';
import { kindFromTypeId } from '../../../domain';
import { getNotation } from '../../../notations';
import type { Selection } from '../../model/selection';
import { RelationshipMarkers } from '../../diagram/RelationshipMarkers';
import { markerUrl } from '../../../diagram/relationships/markers';
import { dasharrayForPattern } from '../../../diagram/relationships/style';
import type {
  SandboxNode,
  SandboxAddRelatedDirection,
  SandboxInsertIntermediatesMode,
  SandboxInsertIntermediatesOptions,
  SandboxRelationshipVisibilityMode,
  SandboxRelationshipsState,
  SandboxUiState,
  SandboxState,
} from '../workspace/controller/sandboxTypes';

import { dataTransferHasElement, readDraggedElementId } from '../../diagram/dragDrop';

import type { Point } from '../../diagram/geometry';
import { polylineMidPoint, rectAlignedOrthogonalAnchorsWithEndpointAnchors } from '../../diagram/geometry';
import { orthogonalRoutingHintsFromAnchors } from '../../diagram/orthogonalHints';
import { adjustOrthogonalConnectionEndpoints } from '../../diagram/adjustConnectionEndpoints';
import { getConnectionPath } from '../../diagram/connectionPath';
import { applyLaneOffsetsSafely } from '../../diagram/connectionLanes';

import '../../../styles/analysisSandbox.css';

import { SaveSandboxAsDiagramDialog } from './SaveSandboxAsDiagramDialog';
import { SandboxInsertDialog } from './SandboxInsertDialog';

const NODE_W = 180;
const NODE_H = 56;

const GRID_SIZE = 20;

type SandboxViewport = { x: number; y: number; w: number; h: number };

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function translateViewport(v: SandboxViewport, dx: number, dy: number): SandboxViewport {
  return { ...v, x: v.x + dx, y: v.y + dy };
}

function zoomViewport(v: SandboxViewport, zoomFactor: number, anchor: Point): SandboxViewport {
  // zoomFactor < 1 => zoom in (smaller viewBox), > 1 => zoom out.
  const nextW = clamp(v.w * zoomFactor, 120, 200000);
  const nextH = clamp(v.h * zoomFactor, 120, 200000);
  const rx = nextW / v.w;
  const ry = nextH / v.h;
  const nextX = anchor.x - (anchor.x - v.x) * rx;
  const nextY = anchor.y - (anchor.y - v.y) * ry;
  return { x: nextX, y: nextY, w: nextW, h: nextH };
}

function layoutForSandboxNode(n: SandboxNode): ViewNodeLayout {
  return { elementId: n.elementId, x: n.x, y: n.y, width: NODE_W, height: NODE_H };
}

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
  ui,
  selection,
  selectionElementIds,
  onSelectElement,
  onSelectRelationship,
  onClearSelection,
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
  onAddRelatedFromSelection,
  onInsertIntermediatesBetween,
  onSaveAsDiagram,
  onAutoLayout,
  onSetPersistEnabled,
  onSetEdgeRouting,
  onClearWarning,
  onUndoLastInsert,
}: {
  model: Model;
  nodes: SandboxNode[];
  relationships: SandboxRelationshipsState;
  addRelated: SandboxState['addRelated'];
  ui: SandboxUiState;
  selection: Selection;
  selectionElementIds: string[];
  onSelectElement: (elementId: string) => void;
  onSelectRelationship: (relationshipId: string) => void;
  onClearSelection: () => void;
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
  onAddRelatedFromSelection: (anchorElementIds: string[], allowedElementIds?: string[]) => void;
  onInsertIntermediatesBetween: (
    sourceElementId: string,
    targetElementId: string,
    options: SandboxInsertIntermediatesOptions
  ) => void;
  onSaveAsDiagram: (name: string, visibleRelationshipIds: string[]) => void;
  onAutoLayout: () => void;
  onSetPersistEnabled: (enabled: boolean) => void;
  onSetEdgeRouting: (routing: 'straight' | 'orthogonal') => void;
  onClearWarning: () => void;
  onUndoLastInsert: () => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);

// Non-passive wheel listener so we can reliably prevent browser zoom (trackpad pinch often becomes ctrl+wheel).
useEffect(() => {
  const svg = svgRef.current;
  if (!svg) return;

  const handleWheel = (ev: globalThis.WheelEvent) => {
    // In most browsers trackpad pinch is delivered as ctrl+wheel; users may also hold Cmd/Ctrl intentionally.
    if (!ev.ctrlKey && !ev.metaKey) return;
    const anchor = clientToSvg(svg, ev.clientX, ev.clientY);
    const zoomFactor = Math.exp(ev.deltaY * 0.0015);
    setViewport((cur) => (cur ? zoomViewport(cur, zoomFactor, anchor) : cur));
    suppressNextBackgroundClickRef.current = true;
    ev.preventDefault();
  };

  // Safari may also fire gesture* events for trackpad pinch; prevent default to avoid page zoom.
  const preventGesture = (ev: Event) => {
    ev.preventDefault();
    suppressNextBackgroundClickRef.current = true;
  };

  svg.addEventListener('wheel', handleWheel as unknown as EventListener, { passive: false });
  // These are WebKit-only but harmless elsewhere.
  svg.addEventListener('gesturestart', preventGesture as EventListener, { passive: false } as AddEventListenerOptions);
  svg.addEventListener('gesturechange', preventGesture as EventListener, { passive: false } as AddEventListenerOptions);
  svg.addEventListener('gestureend', preventGesture as EventListener, { passive: false } as AddEventListenerOptions);

  return () => {
    svg.removeEventListener('wheel', handleWheel as unknown as EventListener);
    svg.removeEventListener('gesturestart', preventGesture as EventListener);
    svg.removeEventListener('gesturechange', preventGesture as EventListener);
    svg.removeEventListener('gestureend', preventGesture as EventListener);
  };
}, []);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // Sandbox-local pair selection for "Insert between selection".
  // Keeps sandbox operations independent from the global single-selection UX.
  const [pairSelection, setPairSelection] = useState<string[]>([]);

  // Keep local edge highlight in sync with global selection so the PropertiesPanel
  // can drive relationship selection.
  useEffect(() => {
    if (selection.kind === 'relationship') {
      setSelectedEdgeId(selection.relationshipId);
      setPairSelection([]);
      return;
    }
    setSelectedEdgeId(null);
  }, [selection]);

  const [edgeCapDismissed, setEdgeCapDismissed] = useState(false);

  const [viewport, setViewport] = useState<SandboxViewport | null>(null);
  // The model can contain mixed notations (e.g. ArchiMate + UML + BPMN) via qualified type ids.
  // Infer the notation per element using its type prefix rather than relying on a global model kind.
  const archimateNotation = useMemo(() => getNotation('archimate'), []);
  const umlNotation = useMemo(() => getNotation('uml'), []);
  const bpmnNotation = useMemo(() => getNotation('bpmn'), []);
  const viewBox = useMemo(() => (viewport ? `${viewport.x} ${viewport.y} ${viewport.w} ${viewport.h}` : undefined), [viewport]);

  const panRef = useRef<{ pointerId: number; last: Point } | null>(null);
  const pinchRef = useRef<{ pointerIds: [number, number]; lastMid: Point; lastDist: number } | null>(null);
  const suppressNextBackgroundClickRef = useRef(false);

  const [insertMode, setInsertMode] = useState<SandboxInsertIntermediatesMode>('shortest');
  const [insertK, setInsertK] = useState(3);
  const [insertMaxHops, setInsertMaxHops] = useState(8);
  const [insertDirection, setInsertDirection] = useState<SandboxAddRelatedDirection>('both');

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [insertBetweenDialogOpen, setInsertBetweenDialogOpen] = useState(false);
  const [insertBetweenEndpoints, setInsertBetweenEndpoints] = useState<[string, string] | null>(null);
  const [insertFromEdgeDialogOpen, setInsertFromEdgeDialogOpen] = useState(false);
  const [insertFromEdgeEndpoints, setInsertFromEdgeEndpoints] = useState<[string, string] | null>(null);

  const [addRelatedDialogOpen, setAddRelatedDialogOpen] = useState(false);
  const [addRelatedDialogAnchors, setAddRelatedDialogAnchors] = useState<string[]>([]);

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

  const addRelatedAnchors = useMemo(() => {
    const raw = pairSelection.length ? pairSelection : selectionElementIds;
    const uniq = Array.from(new Set(raw.filter((id) => nodeById.has(id))));
    return uniq;
  }, [nodeById, pairSelection, selectionElementIds]);

  const insertAnchors = useMemo(() => {
    const uniq = Array.from(new Set(selectionElementIds.filter((id) => nodeById.has(id))));
    return uniq;
  }, [nodeById, selectionElementIds]);

  const pairAnchors = useMemo(() => {
    const uniq = Array.from(new Set(pairSelection.filter((id) => nodeById.has(id))));
    return uniq.slice(0, 2);
  }, [nodeById, pairSelection]);

  const canInsertIntermediates = useMemo(() => {
    // Prefer the local pair selection; fall back to global selection if it happens to include 2 sandbox nodes.
    const anchors = pairAnchors.length ? pairAnchors : insertAnchors;
    // Relationship type filtering is configured in the dialog; don't block opening it.
    return anchors.length === 2;
  }, [insertAnchors, pairAnchors]);

  const canAddRelated = useMemo(() => {
    return addRelatedAnchors.length > 0;
  }, [addRelatedAnchors.length]);
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
  const explicitIdSet = useMemo(() => new Set(relationships.explicitIds), [relationships.explicitIds]);

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
    if (relationships.mode === 'types') return baseVisibleRelationships.filter((r) => enabledTypeSet.has(r.type));
    // explicit ids
    return baseVisibleRelationships.filter((r) => explicitIdSet.has(r.id));
  }, [baseVisibleRelationships, enabledTypeSet, explicitIdSet, relationships.mode, relationships.show]);

  const relationshipCap = ui.maxEdges;
  const edgeOverflow = useMemo(() => {
    if (!relationships.show) return 0;
    return Math.max(0, visibleRelationships.length - relationshipCap);
  }, [relationshipCap, relationships.show, visibleRelationships.length]);

  useEffect(() => {
    if (edgeOverflow > 0) setEdgeCapDismissed(false);
  }, [edgeOverflow]);

  const renderedRelationships = useMemo(() => {
    if (edgeOverflow <= 0) return visibleRelationships;
    return visibleRelationships.slice(0, relationshipCap);
  }, [edgeOverflow, relationshipCap, visibleRelationships]);

  const orthogonalPointsByRelationshipId = useMemo(() => {
    if (ui.edgeRouting !== 'orthogonal') return new Map<string, Point[]>();
    if (!relationships.show) return new Map<string, Point[]>();
    if (renderedRelationships.length === 0) return new Map<string, Point[]>();

    const layoutsByElementId = new Map<string, ViewNodeLayout>();
    for (const n of nodes) {
      layoutsByElementId.set(n.elementId, layoutForSandboxNode(n));
    }

    const obstacleRects: Array<{ id: string; x: number; y: number; w: number; h: number }> = nodes.map((n) => ({
      id: n.elementId,
      x: n.x,
      y: n.y,
      w: NODE_W,
      h: NODE_H,
    }));

    const laneItems: Array<{ id: string; points: Point[] }> = [];
    const obstaclesById = new Map<string, Array<{ x: number; y: number; w: number; h: number }>>();

    for (const r of renderedRelationships) {
      const sId = r.sourceElementId as string;
      const tId = r.targetElementId as string;
      const s = layoutsByElementId.get(sId);
      const t = layoutsByElementId.get(tId);
      if (!s || !t) continue;

      const { start, end } = rectAlignedOrthogonalAnchorsWithEndpointAnchors(s, t);

      const obstacles = obstacleRects
        .filter((o) => o.id !== sId && o.id !== tId)
        .map(({ id: _id, ...rect }) => rect);

      obstaclesById.set(r.id, obstacles);

      const hints = {
        ...orthogonalRoutingHintsFromAnchors(s, start, t, end, GRID_SIZE),
        obstacles,
        obstacleMargin: GRID_SIZE / 2,
        laneSpacing: GRID_SIZE / 2,
        maxChannelShiftSteps: 10,
      };

      let points = getConnectionPath({ route: { kind: 'orthogonal' }, points: undefined }, { a: start, b: end, hints }).points;
      points = adjustOrthogonalConnectionEndpoints(points, s, t, { stubLength: GRID_SIZE / 2 });

      laneItems.push({ id: r.id, points });
    }

    const adjusted = applyLaneOffsetsSafely(laneItems, {
      gridSize: GRID_SIZE,
      obstaclesById,
      obstacleMargin: GRID_SIZE / 2,
    });

    const map = new Map<string, Point[]>();
    for (const it of adjusted) map.set(it.id, it.points);
    return map;
  }, [nodes, renderedRelationships, relationships.show, ui.edgeRouting]);

  const fitToContent = useCallback(() => {
    if (!nodes.length) {
      setViewport(null);
      return;
    }
    let minX = nodes[0].x;
    let minY = nodes[0].y;
    let maxX = nodes[0].x + NODE_W;
    let maxY = nodes[0].y + NODE_H;
    for (const n of nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + NODE_W);
      maxY = Math.max(maxY, n.y + NODE_H);
    }
    const margin = 80;
    const vbX = Math.floor(minX - margin);
    const vbY = Math.floor(minY - margin);
    const vbW = Math.ceil(Math.max(320, maxX - minX + margin * 2));
    const vbH = Math.ceil(Math.max(240, maxY - minY + margin * 2));
    setViewport({ x: vbX, y: vbY, w: vbW, h: vbH });
  }, [nodes]);

  // Initial convenience: after the first node appears, zoom out to show it.
  useEffect(() => {
    if (viewport) return;
    if (nodes.length === 0) return;
    fitToContent();
  }, [fitToContent, nodes.length, viewport]);

  const selectedEdge = useMemo(() => {
    if (!selectedEdgeId) return null;
    const r = (model.relationships as Record<string, any>)[selectedEdgeId];
    if (!r) return null;
    if (!r.sourceElementId || !r.targetElementId) return null;
    if (!nodeById.has(r.sourceElementId)) return null;
    if (!nodeById.has(r.targetElementId)) return null;
    return r as { id: string; type: string; sourceElementId: string; targetElementId: string };
  }, [model.relationships, nodeById, selectedEdgeId]);

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

  const activePointersRef = useRef<Map<number, Point>>(new Map());

  const onPointerDownCanvas = useCallback(
    (e: PointerEvent<SVGSVGElement>) => {
      // Only start pan/pinch on the background, not when interacting with nodes/edges.
      if (e.target !== e.currentTarget) return;
      if (e.pointerType !== 'touch' && e.button !== 0) return;
      const svg = svgRef.current;
      if (!svg) return;

      // Ensure we have a viewBox to manipulate.
      if (!viewport) {
        fitToContent();
      }

      try {
        svg.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }

      const p = clientToSvg(svg, e.clientX, e.clientY);
      activePointersRef.current.set(e.pointerId, p);

      const pts = Array.from(activePointersRef.current.entries());
      if (pts.length === 1) {
        panRef.current = { pointerId: e.pointerId, last: p };
        pinchRef.current = null;
      } else if (pts.length === 2) {
        // Pinch zoom. Keep last midpoint and last distance in world coords.
        const a = pts[0][1];
        const b = pts[1][1];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.max(1e-6, Math.hypot(dx, dy));
        pinchRef.current = { pointerIds: [pts[0][0], pts[1][0]], lastMid: mid, lastDist: dist };
        panRef.current = null;
      } else {
        // Ignore more than two pointers.
      }

      e.preventDefault();
    },
    [fitToContent, viewport]
  );

  const onPointerMove = useCallback(
    (e: PointerEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;

      // Node drag has priority.
      if (drag) {
        const p = clientToSvg(svg, e.clientX, e.clientY);
        const nx = p.x - drag.offsetX;
        const ny = p.y - drag.offsetY;
        onMoveNode(drag.elementId, nx, ny);
        e.preventDefault();
        return;
      }

      // Pan / pinch only when we have captured a background pointer.
      if (!activePointersRef.current.has(e.pointerId)) return;

      const p = clientToSvg(svg, e.clientX, e.clientY);
      activePointersRef.current.set(e.pointerId, p);

      const pinch = pinchRef.current;
      if (pinch && activePointersRef.current.has(pinch.pointerIds[0]) && activePointersRef.current.has(pinch.pointerIds[1])) {
        const a = activePointersRef.current.get(pinch.pointerIds[0])!;
        const b = activePointersRef.current.get(pinch.pointerIds[1])!;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.max(1e-6, Math.hypot(dx, dy));

        const deltaMid = { x: mid.x - pinch.lastMid.x, y: mid.y - pinch.lastMid.y };
        const zoomFactor = clamp(pinch.lastDist / dist, 0.2, 5);

        setViewport((cur) => {
          if (!cur) return cur;
          let next = translateViewport(cur, -deltaMid.x, -deltaMid.y);
          next = zoomViewport(next, zoomFactor, mid);
          return next;
        });

        pinch.lastMid = mid;
        pinch.lastDist = dist;
        suppressNextBackgroundClickRef.current = true;
        e.preventDefault();
        return;
      }

      const pan = panRef.current;
      if (pan && pan.pointerId === e.pointerId) {
        const delta = { x: p.x - pan.last.x, y: p.y - pan.last.y };
        if (Math.abs(delta.x) > 0.5 || Math.abs(delta.y) > 0.5) {
          suppressNextBackgroundClickRef.current = true;
        }
        setViewport((cur) => (cur ? translateViewport(cur, -delta.x, -delta.y) : cur));
        pan.last = p;
        e.preventDefault();
      }
    },
    [drag, onMoveNode]
  );

  const onPointerUpOrCancel = useCallback(
    (e: PointerEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;

      if (drag) {
        setDrag(null);
        try {
          (e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        return;
      }

      if (activePointersRef.current.has(e.pointerId)) {
        activePointersRef.current.delete(e.pointerId);
      }

      // End pan/pinch depending on remaining pointers.
      if (activePointersRef.current.size < 2) {
        pinchRef.current = null;
      }
      const pan = panRef.current;
      if (pan && pan.pointerId === e.pointerId) {
        panRef.current = null;
      }

      // If exactly one pointer remains (touch), seamlessly continue as pan.
      if (activePointersRef.current.size === 1) {
        const [onlyId, onlyPoint] = Array.from(activePointersRef.current.entries())[0];
        panRef.current = { pointerId: onlyId, last: onlyPoint };
      }

      try {
        svg.releasePointerCapture(e.pointerId);
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

  const onOpenInsertBetweenDialog = useCallback(() => {
    const anchors = pairAnchors.length ? pairAnchors : insertAnchors;
    if (anchors.length !== 2) return;
    setInsertBetweenEndpoints([anchors[0], anchors[1]]);
    setInsertBetweenDialogOpen(true);
  }, [insertAnchors, pairAnchors]);

  const onOpenInsertFromSelectedEdgeDialog = useCallback(() => {
    if (!selectedEdge) return;
    setInsertFromEdgeEndpoints([selectedEdge.sourceElementId, selectedEdge.targetElementId]);
    setInsertFromEdgeDialogOpen(true);
  }, [selectedEdge]);

  const onOpenAddRelatedDialog = useCallback(() => {
    if (addRelatedAnchors.length === 0) return;
    setAddRelatedDialogAnchors(addRelatedAnchors);
    setAddRelatedDialogOpen(true);
  }, [addRelatedAnchors]);

  const onCanvasClick = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      // Only treat clicks on the SVG background as "clear selection".
      if (e.target !== e.currentTarget) return;
      if (suppressNextBackgroundClickRef.current) {
        suppressNextBackgroundClickRef.current = false;
        return;
      }
      // Clear any focus ring that might linger on previously clicked SVG elements (notably relationships).
      // Some browsers (e.g. Safari) can keep a focus outline even after selection state is cleared.
      (document.activeElement as any)?.blur?.();
      setSelectedEdgeId(null);
      setPairSelection([]);
      onClearSelection();
    },
    [onClearSelection]
  );

  const onClickNode = useCallback(
    (e: MouseEvent<SVGGElement>, elementId: string) => {
      e.stopPropagation();
      setSelectedEdgeId(null);

      if (e.shiftKey) {
        setPairSelection((prev) => {
          const cur = prev.filter(Boolean);
          if (cur.length === 0) return [elementId];
          if (cur.length === 1) {
            return cur[0] === elementId ? [] : [cur[0], elementId];
          }

          const [a, b] = cur;
          if (elementId === a) return [b];
          if (elementId === b) return [a];
          // Replace the secondary selection but keep the primary stable.
          return [a, elementId];
        });
      } else {
        // Normal click sets a single local selection (primary).
        setPairSelection([elementId]);
      }

      onSelectElement(elementId);
    },
    [onSelectElement]
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
            onClick={() => setSaveDialogOpen(true)}
            disabled={!nodes.length}
            aria-disabled={!nodes.length}
            title="Create a new model diagram from the current sandbox layout"
          >
            Save as diagram…
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
          {ui.lastInsertedElementIds.length > 0 ? (
            <button
              type="button"
              className="miniLinkButton"
              onClick={onUndoLastInsert}
              title="Undo the last insertion batch"
            >
              Undo
            </button>
          ) : null}
        </div>
      </div>

      {ui.warning || (edgeOverflow > 0 && !edgeCapDismissed) ? (
        <div
          role="alert"
          style={{
            marginTop: 10,
            padding: '10px 12px',
            border: '1px solid var(--border-1)',
            borderRadius: 6,
            background: 'rgba(255, 204, 0, 0.12)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ fontSize: 12, lineHeight: 1.4 }}>
            {ui.warning ? <div>{ui.warning}</div> : null}
            {edgeOverflow > 0 && !edgeCapDismissed ? (
              <div>
                Relationship rendering capped at {ui.maxEdges}. Hidden {edgeOverflow} relationship(s).
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="miniLinkButton"
            onClick={() => {
              onClearWarning();
              setEdgeCapDismissed(true);
            }}
            title="Dismiss warnings"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {ui.lastInsertedElementIds.length > 0 ? (
        <div
          role="status"
          style={{
            marginTop: 10,
            padding: '8px 12px',
            border: '1px solid var(--border-1)',
            borderRadius: 6,
            background: 'rgba(0, 128, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ fontSize: 12, lineHeight: 1.4 }}>
            Inserted {ui.lastInsertedElementIds.length} element(s).
          </div>
          <button
            type="button"
            className="miniLinkButton"
            onClick={onUndoLastInsert}
            title="Undo last insert"
          >
            Undo
          </button>
        </div>
      ) : null}

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
              <option value="explicit">Explicit set</option>
            </select>
          ) : null}

          {relationships.show ? (
            <select
              className="selectInput"
              value={ui.edgeRouting}
              onChange={(e) => onSetEdgeRouting(e.currentTarget.value as 'straight' | 'orthogonal')}
              aria-label="Relationship routing style"
              title="How to draw relationships in the sandbox"
            >
              <option value="straight">Edges: Straight</option>
              <option value="orthogonal">Edges: Orthogonal</option>
            </select>
          ) : null}
          <p className="crudHint" style={{ margin: 0 }}>
            {relationships.show
              ? relationships.mode === 'explicit'
                ? `${baseVisibleRelationships.length} relationships between ${nodes.length}/${ui.maxNodes} node(s) · explicit: ${relationships.explicitIds.length} id(s)`
                : `${baseVisibleRelationships.length} relationships between ${nodes.length}/${ui.maxNodes} node(s)`
              : 'Relationships are hidden'}
          </p>
        </div>

        <div className="toolbarGroup" style={{ minWidth: 220 }}>
          <label>Layout</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="miniLinkButton"
              onClick={onAutoLayout}
              disabled={!nodes.length}
              aria-disabled={!nodes.length}
              title="Auto layout sandbox nodes"
            >
              Auto layout
            </button>
            <button
              type="button"
              className="miniLinkButton"
              onClick={fitToContent}
              disabled={!nodes.length}
              aria-disabled={!nodes.length}
              title="Fit the canvas to the current sandbox content"
            >
              Fit to content
            </button>
            <button
              type="button"
              className="miniLinkButton"
              onClick={() => setViewport(null)}
              title="Reset canvas view"
            >
              Reset view
            </button>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.9 }}>
            <input
              type="checkbox"
              checked={ui.persistEnabled}
              onChange={(e) => onSetPersistEnabled(e.currentTarget.checked)}
            />
            <span>Persist sandbox in session</span>
          </label>
          <p className="crudHint" style={{ margin: 0 }}>
            Caps: {ui.maxNodes} nodes / {ui.maxEdges} relationships
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
        <div className="toolbarGroup" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
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
            onClick={onOpenAddRelatedDialog}
            disabled={!canAddRelated}
            aria-disabled={!canAddRelated}
            title={addRelatedAnchors.length ? 'Add related elements around the selected sandbox node(s)' : 'Select one or more sandbox nodes to expand'}
          >
            Add related…
          </button>

          <button
            type="button"
            className="miniLinkButton"
            onClick={() => {
              if (selectedEdge) {
                onOpenInsertFromSelectedEdgeDialog();
              } else {
                onOpenInsertBetweenDialog();
              }
            }}
            disabled={!selectedEdge && !canInsertIntermediates}
            aria-disabled={!selectedEdge && !canInsertIntermediates}
            title={
              selectedEdge
                ? 'Preview and insert intermediate elements between the selected relationship endpoints'
                : (pairAnchors.length ? pairAnchors : insertAnchors).length === 2
                  ? 'Preview and insert intermediate elements between the two selected sandbox nodes'
                  : 'Pick two sandbox nodes: click first, then Shift-click second'
            }
          >
            Insert intermediate…
          </button>
        </div>
      </div>

      <div className="analysisSandboxRoot" aria-label="Analysis sandbox">
        <svg
          ref={svgRef}
          className={`analysisSandboxSvg ${isDropTarget ? 'isDropTarget' : ''}`}
          viewBox={viewBox}
          preserveAspectRatio={viewBox ? 'xMinYMin meet' : undefined}
          onPointerDown={onPointerDownCanvas}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUpOrCancel}
          onPointerCancel={onPointerUpOrCancel}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={onCanvasClick}
          role="img"
          aria-label="Sandbox canvas"
        >
          <RelationshipMarkers />
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

          {renderedRelationships.map((r) => {
  const sId = r.sourceElementId as string;
  const tId = r.targetElementId as string;
  const s = nodeById.get(sId);
  const t = nodeById.get(tId);
  if (!s || !t) return null;

  const x1 = s.x + NODE_W / 2;
  const y1 = s.y + NODE_H / 2;
  const x2 = t.x + NODE_W / 2;
  const y2 = t.y + NODE_H / 2;

  const orthoPoints = ui.edgeRouting === 'orthogonal' ? orthogonalPointsByRelationshipId.get(r.id) ?? null : null;
  const points: Point[] =
    orthoPoints ??
    [
      { x: x1, y: y1 },
      { x: x2, y: y2 },
    ];

  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${Math.round(p.x)} ${Math.round(p.y)}`).join(' ');

  const isSelected = selectedEdgeId === r.id || (selection.kind === 'relationship' && selection.relationshipId === r.id);

  const relKind = kindFromTypeId(String(r.type));
  const relNotation = relKind === 'uml' ? umlNotation : relKind === 'bpmn' ? bpmnNotation : archimateNotation;
  const relStyle = relNotation.getRelationshipStyle(r as any);
  const dasharray = relStyle.line?.dasharray ?? dasharrayForPattern(relStyle.line?.pattern);
  const markerStart = markerUrl(relStyle.markerStart, isSelected);
  const markerEnd = markerUrl(relStyle.markerEnd, isSelected);
  const mid = relStyle.midLabel ? polylineMidPoint(points) : null;

  return (
    <g key={r.id} className="analysisSandboxEdge">
      <path
        className="diagramRelHit"
        d={d}
        style={{ strokeWidth: 16 }}
        onClick={(e) => {
          e.stopPropagation();

          // Toggle relationship selection: clicking the selected edge again clears selection.
          if (selectedEdgeId === r.id) {
            // Clear any lingering focus ring (Safari can be sticky).
            (document.activeElement as any)?.blur?.();
            setSelectedEdgeId(null);
            setPairSelection([]);
            onClearSelection();
            return;
          }

          setSelectedEdgeId(r.id);
          setPairSelection([]);
          onSelectRelationship(r.id);
        }}
      />
      <path
        className={'diagramRelLine' + (isSelected ? ' isSelected' : '')}
        d={d}
        markerStart={markerStart}
        markerEnd={markerEnd}
        strokeDasharray={dasharray ?? undefined}
      />

      {mid ? (
        <text
          x={mid.x}
          y={mid.y - 6}
          fontFamily="system-ui, -apple-system, Segoe UI, Roboto, Arial"
          fontSize={12}
          fontWeight={800}
          fill="rgba(0,0,0,0.65)"
          textAnchor="middle"
          pointerEvents="none"
        >
          {relStyle.midLabel}
        </text>
      ) : null}
    </g>
  );
})}


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
                onPointerDown={(e) => onPointerDownNode(e, n.elementId)}
                onDoubleClick={() => onSelectElement(n.elementId)}
                onClick={(e) => onClickNode(e, n.elementId)}
                role="button"
                tabIndex={0}
                aria-label={label}
              >
                <rect width={NODE_W} height={NODE_H} rx={8} ry={8} style={{ fill: bgVar }} />
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

	      <SandboxInsertDialog
	        kind="intermediates"
        isOpen={insertBetweenDialogOpen}
        model={model}
        maxNodes={ui.maxNodes}
        sourceElementId={insertBetweenEndpoints?.[0] ?? ''}
        targetElementId={insertBetweenEndpoints?.[1] ?? ''}
        contextLabel="Between"
        existingElementIds={nodes.map((n) => n.elementId)}
        allRelationshipTypes={allRelationshipTypes}
        initialEnabledRelationshipTypes={addRelated.enabledTypes}
        initialOptions={{
          mode: insertMode,
          k: insertK,
          maxHops: insertMaxHops,
          direction: insertDirection,
        }}
        onCancel={() => setInsertBetweenDialogOpen(false)}
        onConfirm={({ enabledRelationshipTypes, options, selectedElementIds }) => {
          setInsertBetweenDialogOpen(false);
          setInsertMode(options.mode);
          setInsertK(options.k);
          setInsertMaxHops(options.maxHops);
          setInsertDirection(options.direction);

          // Keep traversal settings consistent with the insert preview.
          onSetAddRelatedEnabledTypes(enabledRelationshipTypes);

          const src = insertBetweenEndpoints?.[0];
          const dst = insertBetweenEndpoints?.[1];
          if (!src || !dst) return;
          onInsertIntermediatesBetween(src, dst, { ...options, allowedElementIds: selectedElementIds });
        }}
      />

	      <SandboxInsertDialog
	        kind="intermediates"
        isOpen={insertFromEdgeDialogOpen}
        model={model}
        maxNodes={ui.maxNodes}
        sourceElementId={insertFromEdgeEndpoints?.[0] ?? ''}
        targetElementId={insertFromEdgeEndpoints?.[1] ?? ''}
        contextLabel="From relationship"
        contextRelationshipType={selectedEdge?.type}
        existingElementIds={nodes.map((n) => n.elementId)}
        allRelationshipTypes={allRelationshipTypes}
        initialEnabledRelationshipTypes={addRelated.enabledTypes}
        initialOptions={{
          mode: insertMode,
          k: insertK,
          maxHops: insertMaxHops,
          direction: insertDirection,
        }}
        onCancel={() => setInsertFromEdgeDialogOpen(false)}
        onConfirm={({ enabledRelationshipTypes, options, selectedElementIds }) => {
          setInsertFromEdgeDialogOpen(false);
          setInsertMode(options.mode);
          setInsertK(options.k);
          setInsertMaxHops(options.maxHops);
          setInsertDirection(options.direction);

          // Keep traversal settings consistent with the insert preview.
          onSetAddRelatedEnabledTypes(enabledRelationshipTypes);

          const src = insertFromEdgeEndpoints?.[0];
          const dst = insertFromEdgeEndpoints?.[1];
          if (!src || !dst) return;
          onInsertIntermediatesBetween(src, dst, { ...options, allowedElementIds: selectedElementIds });
        }}
      />

	      <SandboxInsertDialog
	        kind="related"
	        isOpen={addRelatedDialogOpen}
	        model={model}
	        maxNodes={ui.maxNodes}
	        anchorElementIds={addRelatedDialogAnchors}
	        existingElementIds={nodes.map((n) => n.elementId)}
	        allRelationshipTypes={allRelationshipTypes}
	        initialEnabledRelationshipTypes={addRelated.enabledTypes}
	        initialOptions={{ depth: addRelated.depth, direction: addRelated.direction }}
	        onCancel={() => setAddRelatedDialogOpen(false)}
	        onConfirm={({ enabledRelationshipTypes, options, selectedElementIds }) => {
	          setAddRelatedDialogOpen(false);
	          // Persist settings for the next time.
	          onSetAddRelatedDepth(options.depth);
	          onSetAddRelatedDirection(options.direction);
	          onSetAddRelatedEnabledTypes(enabledRelationshipTypes);
	          if (addRelatedDialogAnchors.length === 0) return;
	          onAddRelatedFromSelection(addRelatedDialogAnchors, selectedElementIds);
	        }}
	      />

      <SaveSandboxAsDiagramDialog
        isOpen={saveDialogOpen}
        initialName="Sandbox diagram"
        onCancel={() => setSaveDialogOpen(false)}
        onConfirm={(name) => {
          setSaveDialogOpen(false);
          const ids = renderedRelationships.map((r) => r.id);
          onSaveAsDiagram(name, ids);
        }}
      />
    </div>
  );
}
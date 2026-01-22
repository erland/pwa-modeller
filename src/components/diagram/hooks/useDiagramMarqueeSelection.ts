import type * as React from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';

import type { Model, View, ViewNodeLayout } from '../../../domain';
import type { Selection } from '../../model/selection';
import type { Point } from '../geometry';
import { findNearestConnectionHit } from './useDiagramConnections';
import type { ToolMode } from './useDiagramToolState';

type HitItem = { relationshipId: string; connectionId: string; points: Point[] };

export type MarqueeRect = { x: number; y: number; width: number; height: number };

type Args = {
  toolMode: ToolMode;
  model: Model | null;
  activeViewId: string | null;
  activeView: View | null;
  nodes: ViewNodeLayout[];
  selection: Selection;
  linkDrag: unknown; // we only need to check truthiness
  surfaceRef: React.RefObject<HTMLDivElement>;
  clientToModelPoint: (clientX: number, clientY: number) => Point | null;
  zoom: number;
  hitItems: HitItem[];
  onSurfacePointerDownCapture: (e: React.PointerEvent<HTMLDivElement>) => void;
  onSelect: (sel: Selection) => void;
};

function makeRect(a: Point, b: Point): MarqueeRect {
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x, b.x);
  const y2 = Math.max(a.y, b.y);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function nodeInsideRect(n: ViewNodeLayout, r: MarqueeRect): boolean {
  // Only select placed elements (exclude view objects) and require a bounding box.
  if (!n.elementId) return false;
  const w = n.width ?? 120;
  const h = n.height ?? 60;
  return n.x >= r.x && n.y >= r.y && n.x + w <= r.x + r.width && n.y + h <= r.y + r.height;
}

function unionSelectedElementIds(prev: Selection, viewId: string, nextIds: string[]): Selection {
  const set = new Set<string>();
  if (prev.kind === 'viewNode' && prev.viewId === viewId) set.add(prev.elementId);
  if (prev.kind === 'viewNodes' && prev.viewId === viewId) prev.elementIds.forEach((id) => set.add(id));
  nextIds.forEach((id) => set.add(id));

  const ids = Array.from(set);
  if (ids.length === 0) return { kind: 'view', viewId };
  if (ids.length === 1) return { kind: 'viewNode', viewId, elementId: ids[0] };
  return { kind: 'viewNodes', viewId, elementIds: ids };
}

export function useDiagramMarqueeSelection({
  toolMode,
  model,
  activeViewId,
  activeView,
  nodes,
  selection,
  linkDrag,
  surfaceRef,
  clientToModelPoint,
  zoom,
  hitItems,
  onSurfacePointerDownCapture,
  onSelect,
}: Args) {
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);
  const dragRef = useRef<
    | null
    | {
        pointerId: number;
        startClient: { x: number; y: number };
        startModel: Point;
        endModel: Point;
        additive: boolean;
        dragging: boolean;
      }
  >(null);

  const thresholdClientPx = 4;

  const cancelDrag = useCallback(() => {
    dragRef.current = null;
    setMarqueeRect(null);
  }, []);

  const handleSurfacePointerDownCapture = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      onSurfacePointerDownCapture(e);
      if (toolMode !== 'select') return;
      if (!model || !activeViewId || !activeView) return;
      if (linkDrag) return;

      const target = e.target as HTMLElement | null;
      if (target?.closest('.diagramNode, .diagramConnectorNode, .diagramViewObjectNode, .diagramRelHit')) return;

      const p = clientToModelPoint(e.clientX, e.clientY);
      if (!p) return;

      dragRef.current = {
        pointerId: e.pointerId,
        startClient: { x: e.clientX, y: e.clientY },
        startModel: p,
        endModel: p,
        additive: Boolean(e.shiftKey),
        dragging: false,
      };

      // Capture so we keep receiving move/up even if the pointer leaves the surface.
      try {
        surfaceRef.current?.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    },
    [
      onSurfacePointerDownCapture,
      toolMode,
      model,
      activeViewId,
      activeView,
      linkDrag,
      clientToModelPoint,
      surfaceRef,
    ]
  );

  const handleSurfacePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const st = dragRef.current;
      if (!st) return;
      if (e.pointerId !== st.pointerId) return;

      const p = clientToModelPoint(e.clientX, e.clientY);
      if (!p) return;
      st.endModel = p;

      const dx = e.clientX - st.startClient.x;
      const dy = e.clientY - st.startClient.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (!st.dragging && dist >= thresholdClientPx) {
        st.dragging = true;
      }
      if (!st.dragging) return;

      setMarqueeRect(makeRect(st.startModel, st.endModel));
    },
    [clientToModelPoint]
  );

  const commitSelectionFromRect = useCallback(
    (rect: MarqueeRect, additive: boolean) => {
      if (!activeViewId) return;
      const ids = nodes.filter((n) => nodeInsideRect(n, rect)).map((n) => n.elementId as string);

      if (ids.length === 0) {
        // Keep selection if additive; otherwise click-like behavior will handle view selection.
        if (!additive) onSelect({ kind: 'view', viewId: activeViewId });
        return;
      }

      if (additive) {
        onSelect(unionSelectedElementIds(selection, activeViewId, ids));
      } else {
        if (ids.length === 1) onSelect({ kind: 'viewNode', viewId: activeViewId, elementId: ids[0] });
        else onSelect({ kind: 'viewNodes', viewId: activeViewId, elementIds: ids });
      }
    },
    [activeViewId, nodes, onSelect, selection]
  );

  const handleSurfacePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const st = dragRef.current;
      if (!st) return;
      if (e.pointerId !== st.pointerId) return;

      const end = clientToModelPoint(e.clientX, e.clientY) ?? st.endModel;
      st.endModel = end;

      const additive = st.additive;

      // Release capture.
      try {
        surfaceRef.current?.releasePointerCapture(st.pointerId);
      } catch {
        // ignore
      }

      const wasDragging = st.dragging;
      const rect = makeRect(st.startModel, st.endModel);
      cancelDrag();

      if (toolMode !== 'select') return;
      if (!model || !activeViewId || !activeView) return;
      if (linkDrag) return;

      if (wasDragging && (rect.width > 0 || rect.height > 0)) {
        commitSelectionFromRect(rect, additive);
        return;
      }

      // Treat as a click on empty surface: select nearest relationship hit, else the view.
      // If additive (shift), keep the current selection.
      if (additive) return;

      const p = clientToModelPoint(e.clientX, e.clientY);
      if (!p) return;
      const thresholdModel = 10 / Math.max(0.0001, zoom);
      const { best, bestDist } = findNearestConnectionHit(p, hitItems);
      if (best && bestDist <= thresholdModel) {
        onSelect({ kind: 'relationship', relationshipId: best.relationshipId, viewId: activeViewId });
      } else {
        onSelect({ kind: 'view', viewId: activeViewId });
      }
    },
    [
      activeView,
      activeViewId,
      cancelDrag,
      clientToModelPoint,
      commitSelectionFromRect,
      hitItems,
      linkDrag,
      model,
      onSelect,
      surfaceRef,
      toolMode,
      zoom,
    ]
  );

  const handleSurfacePointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const st = dragRef.current;
      if (!st) return;
      if (e.pointerId !== st.pointerId) return;
      cancelDrag();
    },
    [cancelDrag]
  );

  const out = useMemo(
    () => ({
      marqueeRect,
      handleSurfacePointerDownCapture,
      handleSurfacePointerMove,
      handleSurfacePointerUp,
      handleSurfacePointerCancel,
    }),
    [
      marqueeRect,
      handleSurfacePointerDownCapture,
      handleSurfacePointerMove,
      handleSurfacePointerUp,
      handleSurfacePointerCancel,
    ]
  );

  return out;
}

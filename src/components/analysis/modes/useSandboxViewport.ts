import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';

import type { Point } from '../../diagram/geometry';
import { SANDBOX_NODE_H, SANDBOX_NODE_W } from './sandboxConstants';

export type SandboxViewport = { x: number; y: number; w: number; h: number };

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

function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number): Point {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: clientX, y: clientY };
  const sp = pt.matrixTransform(ctm.inverse());
  return { x: sp.x, y: sp.y };
}

export function useSandboxViewport(args: {
  nodes: Array<{ x: number; y: number }>;
  nodeW?: number;
  nodeH?: number;
  margin?: number;
}) {
  const { nodes, nodeW = SANDBOX_NODE_W, nodeH = SANDBOX_NODE_H, margin = 80 } = args;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [viewport, setViewport] = useState<SandboxViewport | null>(null);

  const panRef = useRef<{ pointerId: number; last: Point } | null>(null);
  const pinchRef = useRef<{ pointerIds: [number, number]; lastMid: Point; lastDist: number } | null>(null);
  const activePointersRef = useRef<Map<number, Point>>(new Map());
  const suppressNextBackgroundClickRef = useRef(false);

  const viewBox = useMemo(() => (viewport ? `${viewport.x} ${viewport.y} ${viewport.w} ${viewport.h}` : undefined), [viewport]);

  const clientToWorld = useCallback((clientX: number, clientY: number): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: clientX, y: clientY };
    return clientToSvg(svg, clientX, clientY);
  }, []);

  const consumeSuppressNextBackgroundClick = useCallback((): boolean => {
    if (!suppressNextBackgroundClickRef.current) return false;
    suppressNextBackgroundClickRef.current = false;
    return true;
  }, []);

  const fitToContent = useCallback(() => {
    if (!nodes.length) {
      setViewport(null);
      return;
    }
    let minX = nodes[0].x;
    let minY = nodes[0].y;
    let maxX = nodes[0].x + nodeW;
    let maxY = nodes[0].y + nodeH;
    for (const n of nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + nodeW);
      maxY = Math.max(maxY, n.y + nodeH);
    }
    const vbX = Math.floor(minX - margin);
    const vbY = Math.floor(minY - margin);
    const vbW = Math.ceil(Math.max(320, maxX - minX + margin * 2));
    const vbH = Math.ceil(Math.max(240, maxY - minY + margin * 2));
    setViewport({ x: vbX, y: vbY, w: vbW, h: vbH });
  }, [margin, nodeH, nodeW, nodes]);

  const resetView = useCallback(() => setViewport(null), []);

  // Initial convenience: after the first node appears, zoom out to show it.
  useEffect(() => {
    if (viewport) return;
    if (nodes.length === 0) return;
    fitToContent();
  }, [fitToContent, nodes.length, viewport]);

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
      }

      e.preventDefault();
    },
    [fitToContent, viewport]
  );

  const onPointerMoveCanvas = useCallback((e: PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;

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
  }, []);

  const onPointerUpOrCancelCanvas = useCallback((e: PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;

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
  }, []);

  return {
    svgRef,
    viewport,
    setViewport,
    viewBox,
    fitToContent,
    resetView,
    clientToWorld,
    consumeSuppressNextBackgroundClick,
    onPointerDownCanvas,
    onPointerMoveCanvas,
    onPointerUpOrCancelCanvas,
  };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { View } from '../../../domain';
import type { Point } from '../geometry';
import { clamp } from '../geometry';

export type DiagramBounds = { minX: number; minY: number; maxX: number; maxY: number };

type Args = {
  activeViewId: string | null;
  activeView: View | null;
  bounds: DiagramBounds;
  hasNodes: boolean;
  surfacePadding: number;
};

export function useDiagramViewport({ activeViewId, activeView, bounds, hasNodes, surfacePadding }: Args) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState<number>(1);

  const clientToModelPoint = useCallback(
    (clientX: number, clientY: number): Point | null => {
      // Prefer converting relative to the scaled diagram surface.
      // This avoids vertical offsets caused by sticky overlays inside the scroll viewport.
      const surface = surfaceRef.current;
      if (surface) {
        const rect = surface.getBoundingClientRect();
        return {
          x: (clientX - rect.left) / zoom,
          y: (clientY - rect.top) / zoom,
        };
      }

      // Fallback (should rarely be needed): convert relative to the scroll viewport.
      const vp = viewportRef.current;
      if (!vp) return null;
      const rect = vp.getBoundingClientRect();
      return {
        x: (vp.scrollLeft + (clientX - rect.left)) / zoom,
        y: (vp.scrollTop + (clientY - rect.top)) / zoom,
      };
    },
    [zoom]
  );

  const setZoomKeepingCenter = useCallback(
    (nextZoom: number) => {
      const vp = viewportRef.current;
      if (!vp) {
        setZoom(nextZoom);
        return;
      }
      const cx = (vp.scrollLeft + vp.clientWidth / 2) / zoom;
      const cy = (vp.scrollTop + vp.clientHeight / 2) / zoom;
      setZoom(nextZoom);
      requestAnimationFrame(() => {
        vp.scrollLeft = Math.max(0, cx * nextZoom - vp.clientWidth / 2);
        vp.scrollTop = Math.max(0, cy * nextZoom - vp.clientHeight / 2);
      });
    },
    [zoom]
  );

  const zoomIn = useCallback(() => {
    setZoomKeepingCenter(clamp(Math.round((zoom + 0.1) * 10) / 10, 0.2, 3));
  }, [setZoomKeepingCenter, zoom]);

  const zoomOut = useCallback(() => {
    setZoomKeepingCenter(clamp(Math.round((zoom - 0.1) * 10) / 10, 0.2, 3));
  }, [setZoomKeepingCenter, zoom]);

  const zoomReset = useCallback(() => {
    setZoomKeepingCenter(1);
  }, [setZoomKeepingCenter]);

  const fitToView = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    if (!activeView || !hasNodes) return;

    const bw = bounds.maxX - bounds.minX + surfacePadding;
    const bh = bounds.maxY - bounds.minY + surfacePadding;

    const target = clamp(Math.min(vp.clientWidth / bw, vp.clientHeight / bh), 0.2, 3);
    setZoom(target);

    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    requestAnimationFrame(() => {
      vp.scrollLeft = Math.max(0, cx * target - vp.clientWidth / 2);
      vp.scrollTop = Math.max(0, cy * target - vp.clientHeight / 2);
    });
  }, [activeView, hasNodes, bounds, surfacePadding]);

  // When switching views, reset zoom and center on content (no auto-fit).
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || !activeView || !activeViewId) return;

    setZoom(1);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    requestAnimationFrame(() => {
      vp.scrollLeft = Math.max(0, cx - vp.clientWidth / 2);
      vp.scrollTop = Math.max(0, cy - vp.clientHeight / 2);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeViewId]);

  return {
    viewportRef,
    surfaceRef,
    zoom,
    setZoom,
    clientToModelPoint,
    setZoomKeepingCenter,
    zoomIn,
    zoomOut,
    zoomReset,
    fitToView,
  };
}

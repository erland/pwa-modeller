import type * as React from 'react';
import { useCallback } from 'react';
import type { Model, View } from '../../../domain';
import type { Selection } from '../../model/selection';
import type { ToolMode } from './useDiagramToolState';
import type { Point } from '../geometry';
import { findNearestConnectionHit } from './useDiagramConnections';

type HitItem = { relationshipId: string; connectionId: string; points: Point[] };

type Args = {
  toolMode: ToolMode;
  model: Model | null;
  activeViewId: string | null;
  activeView: View | null;
  linkDrag: unknown; // we only need to check truthiness
  clientToModelPoint: (clientX: number, clientY: number) => Point | null;
  zoom: number;
  hitItems: HitItem[];
  onSurfacePointerDownCapture: (e: React.PointerEvent<HTMLDivElement>) => void;
  onSelect: (sel: Selection) => void;
};

export function useDiagramSurfaceSelection({
  toolMode,
  model,
  activeViewId,
  activeView,
  linkDrag,
  clientToModelPoint,
  zoom,
  hitItems,
  onSurfacePointerDownCapture,
  onSelect,
}: Args) {
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

      // Select the closest connection polyline within a small screen-space threshold.
      const thresholdModel = 10 / Math.max(0.0001, zoom);
      const { best, bestDist } = findNearestConnectionHit(p, hitItems);

      if (best && bestDist <= thresholdModel) {
        onSelect({ kind: 'relationship', relationshipId: best.relationshipId, viewId: activeViewId });
      } else {
        // Clicking empty space selects the view (useful for view-level properties).
        onSelect({ kind: 'view', viewId: activeViewId });
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
      zoom,
      hitItems,
      onSelect,
    ]
  );

  return { handleSurfacePointerDownCapture };
}

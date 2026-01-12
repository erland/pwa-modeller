import { useMemo } from 'react';
import type {View, ViewNodeLayout, ViewObject} from '../../../domain';
import { getDefaultViewObjectSize } from '../../../domain';
import { boundsForNodes } from '../geometry';

export type DiagramNodesController = {
  nodes: ViewNodeLayout[];
  bounds: ReturnType<typeof boundsForNodes>;
  surfacePadding: number;
  surfaceWidthModel: number;
  surfaceHeightModel: number;
};

/**
 * Compute normalized view node layouts plus diagram surface bounds.
 *
 * Responsibilities:
 * - Provide default width/height for nodes missing explicit size
 * - Provide stable zIndex defaults
 * - Compute bounds and surface sizes for the viewport
 */
export function useDiagramNodes(activeView: View | null): DiagramNodesController {
  const nodes: ViewNodeLayout[] = useMemo(
    () =>
      (activeView?.layout?.nodes ?? []).map((n, idx) => {
        const isConn = Boolean(n.connectorId);
        const isObj = Boolean(n.objectId);
        const objects = (activeView?.objects ?? {}) as Record<string, ViewObject>;
        const obj = isObj ? objects[n.objectId!] : undefined;

        let width = n.width;
        let height = n.height;
        if (typeof width !== 'number' || typeof height !== 'number') {
          if (isConn) {
            width = typeof width === 'number' ? width : 24;
            height = typeof height === 'number' ? height : 24;
          } else if (isObj && obj) {
            const d = getDefaultViewObjectSize(obj.type);
            width = typeof width === 'number' ? width : d.width;
            height = typeof height === 'number' ? height : d.height;
          } else {
            width = typeof width === 'number' ? width : 120;
            height = typeof height === 'number' ? height : 60;
          }
        }

        let zIndex = typeof n.zIndex === 'number' ? n.zIndex : idx;
        if (isObj && obj?.type === 'GroupBox' && typeof n.zIndex !== 'number') zIndex = idx - 10000;

        return { ...n, width, height, zIndex };
      }),
    [activeView]
  );

  const bounds = useMemo(() => boundsForNodes(nodes), [nodes]);

  const surfacePadding = 120;
  const surfaceWidthModel = Math.max(800, bounds.maxX + surfacePadding);
  const surfaceHeightModel = Math.max(420, bounds.maxY + surfacePadding);

  return { nodes, bounds, surfacePadding, surfaceWidthModel, surfaceHeightModel };
}
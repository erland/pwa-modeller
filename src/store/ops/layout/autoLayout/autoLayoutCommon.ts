import type { Model } from '../../../../domain';
import type { ViewNodeLayout } from '../../../../domain';
import type { AutoLayoutOptions } from '../../../../domain/layout/types';

export type AnyViewNodeId = string;

export const dedupeSelectionIds = (selectionNodeIds?: string[]): string[] => {
  return Array.isArray(selectionNodeIds)
    ? Array.from(new Set(selectionNodeIds.filter((id) => typeof id === 'string' && id.length > 0))).sort((a, b) =>
        a.localeCompare(b)
      )
    : [];
};

export const hasHierarchyInView = (nodes: Array<{ parentId?: string }>): boolean => {
  return nodes.some((n) => typeof n.parentId === 'string' && n.parentId.length > 0);
};

export const readLockedNodePositions = (
  model: Model | null,
  viewId: string,
  options: AutoLayoutOptions
): { fixedIds: Set<string>; lockedPositions: Record<string, { x: number; y: number }> } => {
  const fixedIds = new Set<string>();
  const lockedPositions: Record<string, { x: number; y: number }> = {};

  if (!options.respectLocked) return { fixedIds, lockedPositions };

  const rawNodes = model?.views[viewId]?.layout?.nodes ?? [];
  for (const n of rawNodes) {
    if (!n.locked) continue;
    const id = n.elementId ?? n.connectorId;
    if (!id) continue;
    fixedIds.add(id);
    lockedPositions[id] = { x: n.x, y: n.y };
  }
  return { fixedIds, lockedPositions };
};

export const readCurrentNodeGeometryById = (
  model: Model | null,
  viewId: string
): Record<AnyViewNodeId, { x: number; y: number; width: number; height: number }> => {
  const out: Record<AnyViewNodeId, { x: number; y: number; width: number; height: number }> = {};
  const rawNodes: ViewNodeLayout[] = model?.views[viewId]?.layout?.nodes ?? [];
  for (const n of rawNodes) {
    const id = n.elementId ?? n.connectorId;
    if (!id) continue;
    out[id] = { x: n.x, y: n.y, width: n.width, height: n.height };
  }
  return out;
};

/**
 * Returns true if we can safely skip committing the layout update.
 *
 * Note: if edge routes exist, we conservatively commit (routes may differ even if positions match).
 */
export const shouldSkipCommit = (
  currentGeometry: Record<string, { x: number; y: number; width: number; height: number }>,
  nextPositions: Record<string, { x: number; y: number }>,
  geometryById?: Record<string, { width?: number; height?: number }>,
  hasEdgeRoutes?: boolean
): boolean => {
  if (hasEdgeRoutes) return false;

  for (const [id, p] of Object.entries(nextPositions)) {
    const c = currentGeometry[id];
    if (!c) return false;
    if (c.x !== p.x || c.y !== p.y) return false;
  }

  if (geometryById) {
    for (const [id, g] of Object.entries(geometryById)) {
      const c = currentGeometry[id];
      if (!c) return false;
      if (typeof g.width === 'number' && c.width !== g.width) return false;
      if (typeof g.height === 'number' && c.height !== g.height) return false;
    }
  }

  return true;
};

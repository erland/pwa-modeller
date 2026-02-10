import type { AutoLayoutOptions, LayoutInput, LayoutOutput } from '../../../../domain/layout/types';
import { computeLayoutSignature } from '../../../../domain/layout';
import { adjustEdgeRoutesForMovedNodes, snapToGrid } from '../../../../domain/layout/post';
import type { Model } from '../../../../domain';
import { autoLayoutMutations } from '../../../mutations';
import type { LayoutOpsDeps } from '../layoutOpsTypes';
import { readCurrentNodeGeometryById, readLockedNodePositions, shouldSkipCommit } from './autoLayoutCommon';

type PreparedHierarchical = { input: LayoutInput; sizes: Record<string, { width: number; height: number }> };

export async function runHierarchicalAutoLayout(args: {
  deps: Pick<LayoutOpsDeps, 'getModel' | 'updateModel' | 'autoLayoutCacheByView'>;
  viewId: string;
  viewKind: string;
  prepared: PreparedHierarchical;
  options: AutoLayoutOptions;
  selectionNodeIds: string[];
}): Promise<void> {
  const { deps, viewId, viewKind, prepared, options, selectionNodeIds } = args;
  const { getModel, updateModel, autoLayoutCacheByView } = deps;

  const { elkLayoutHierarchical } = await import('../../../../domain/layout/elk/elkLayoutHierarchical');

  const signature = computeLayoutSignature({
    viewId,
    viewKind,
    mode: 'hierarchical',
    input: prepared.input,
    options,
    selectionNodeIds,
  });

  const cached = autoLayoutCacheByView.get(viewId);
  const base: LayoutOutput =
    cached && cached.signature === signature ? cached.output : await elkLayoutHierarchical(prepared.input, options);
  if (!cached || cached.signature !== signature) {
    autoLayoutCacheByView.set(viewId, { signature, output: base });
  }

  // Clone output so we don't mutate cached results.
  const output: LayoutOutput = {
    positions: { ...base.positions },
    edgeRoutes: base.edgeRoutes ? { ...base.edgeRoutes } : undefined,
  };

  const fresh = getModel();
  const { fixedIds, lockedPositions } = readLockedNodePositions(fresh, viewId, options);
  for (const [id, p] of Object.entries(lockedPositions)) {
    output.positions[id] = { x: p.x, y: p.y };
  }

  const originalPositions = { ...output.positions };

  // Snap to grid (deterministic + tidy). Avoid overlap nudge for hierarchical layouts,
  // as it can push children outside containers.
  const GRID = 10;
  const snapped = snapToGrid(output.positions, GRID, fixedIds);
  const edgeRoutes = adjustEdgeRoutesForMovedNodes(output.edgeRoutes, prepared.input.edges, originalPositions, snapped);

  // Build geometry updates: positions for all nodes, sizes for container nodes.
  const geometryById: Record<string, { x?: number; y?: number; width?: number; height?: number }> = {};
  for (const [id, pos] of Object.entries(snapped)) {
    geometryById[id] = { ...(geometryById[id] ?? {}), x: pos.x, y: pos.y };
  }

  // Apply computed sizes to container nodes only.
  const childrenByParent = new Map<string, string[]>();
  for (const n of prepared.input.nodes) {
    if (!n.parentId) continue;
    const list = childrenByParent.get(n.parentId) ?? [];
    list.push(n.id);
    childrenByParent.set(n.parentId, list);
  }

  for (const [containerId, kids] of childrenByParent.entries()) {
    if (kids.length === 0) continue;
    const s = prepared.sizes[containerId];
    if (!s) continue;
    geometryById[containerId] = { ...(geometryById[containerId] ?? {}), width: s.width, height: s.height };
  }

  const currentGeometry = readCurrentNodeGeometryById(getModel(), viewId);
  if (
    shouldSkipCommit(
      currentGeometry,
      snapped,
      geometryById,
      Boolean(edgeRoutes && Object.keys(edgeRoutes).length)
    )
  ) {
    return;
  }

  updateModel((model: Model) => {
    autoLayoutMutations.autoLayoutViewGeometry(model, viewId, geometryById, edgeRoutes);
  });
}

import type { AutoLayoutOptions, LayoutInput, LayoutOutput } from '../../../../domain/layout/types';
import { computeLayoutSignature } from '../../../../domain/layout';
import { adjustEdgeRoutesForMovedNodes, nudgeOverlaps, snapToGrid } from '../../../../domain/layout/post';
import type { Model } from '../../../../domain';
import { autoLayoutMutations } from '../../../mutations';
import type { LayoutOpsDeps } from '../layoutOpsTypes';
import { readCurrentNodeGeometryById, readLockedNodePositions, shouldSkipCommit } from './autoLayoutCommon';

export async function runFlatAutoLayout(args: {
  deps: Pick<LayoutOpsDeps, 'getModel' | 'updateModel' | 'autoLayoutCacheByView'>;
  viewId: string;
  viewKind: string;
  extracted: LayoutInput;
  options: AutoLayoutOptions;
  selectionNodeIds: string[];
}): Promise<void> {
  const { deps, viewId, viewKind, extracted, options, selectionNodeIds } = args;
  const { getModel, updateModel, autoLayoutCacheByView } = deps;

  // Lazy-load ELK so it doesn't get pulled into the main bundle until the user runs auto-layout.
  const { elkLayout } = await import('../../../../domain/layout/elk/elkLayout');

  const signature = computeLayoutSignature({
    viewId,
    viewKind,
    mode: 'flat',
    input: extracted,
    options,
    selectionNodeIds,
  });

  const cached = autoLayoutCacheByView.get(viewId);
  const base: LayoutOutput = cached && cached.signature === signature ? cached.output : await elkLayout(extracted, options);
  if (!cached || cached.signature !== signature) {
    autoLayoutCacheByView.set(viewId, { signature, output: base });
  }

  // Clone output so we don't mutate cached results.
  const output: LayoutOutput = {
    positions: { ...base.positions },
    edgeRoutes: base.edgeRoutes ? { ...base.edgeRoutes } : undefined,
  };

  // Post-pass tidy: keep pinned nodes fixed (if requested), snap to grid, then nudge overlaps.
  const fresh = getModel();
  const { fixedIds, lockedPositions } = readLockedNodePositions(fresh, viewId, options);
  for (const [id, p] of Object.entries(lockedPositions)) {
    output.positions[id] = { x: p.x, y: p.y };
  }

  const originalPositions = { ...output.positions };

  // Snap to grid first (keeps things tidy and deterministic).
  const GRID = 10;
  let positions = snapToGrid(output.positions, GRID, fixedIds);

  // Then nudge remaining overlaps. Use node sizes from the layout input.
  const nudgeNodes = [...extracted.nodes]
    .map((n) => ({ id: n.id, w: n.width, h: n.height }))
    .sort((a, b) => a.id.localeCompare(b.id));

  positions = nudgeOverlaps(nudgeNodes, positions, { padding: 10, fixedIds });

  const edgeRoutes = adjustEdgeRoutesForMovedNodes(output.edgeRoutes, extracted.edges, originalPositions, positions);

  const currentGeometry = readCurrentNodeGeometryById(getModel(), viewId);
  if (shouldSkipCommit(currentGeometry, positions, undefined, Boolean(edgeRoutes && Object.keys(edgeRoutes).length))) {
    return;
  }

  updateModel((model: Model) => {
    autoLayoutMutations.autoLayoutView(model, viewId, positions, edgeRoutes);
  });
}

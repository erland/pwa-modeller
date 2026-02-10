import type { Model, ViewNodeLayout } from '../../domain';
import type { AlignMode, AutoLayoutOptions, DistributeMode, SameSizeMode, LayoutOutput } from '../../domain/layout/types';
import { extractLayoutInputForView, fitArchiMateBoxToText, computeLayoutSignature } from '../../domain/layout';
import { adjustEdgeRoutesForMovedNodes, nudgeOverlaps, snapToGrid } from '../../domain/layout/post';
import { autoLayoutMutations, alignMutations, arrangeMutations, fitToTextMutations, layoutMutations } from '../mutations';

export type LayoutOpsDeps = {
  /** Read the latest model snapshot (may be null). */
  getModel: () => Model | null;
  /** Read the latest model snapshot (throws if missing). */
  getModelOrThrow: () => Model;
  /** Commit a model update. */
  updateModel: (mutator: (model: Model) => void, markDirty?: boolean) => void;
  /** Per-view cache for expensive auto-layout computations. */
  autoLayoutCacheByView: Map<string, { signature: string; output: LayoutOutput }>;
};

export const createLayoutOps = (deps: LayoutOpsDeps) => {
  const { getModel, getModelOrThrow, updateModel, autoLayoutCacheByView } = deps;

  const addElementToViewAt = (viewId: string, elementId: string, x: number, y: number): string => {
    let result = elementId;
    updateModel((model) => {
      result = layoutMutations.addElementToViewAt(model, viewId, elementId, x, y);
    });
    return result;
  };

  const addConnectorToViewAt = (viewId: string, connectorId: string, x: number, y: number): string => {
    let result = connectorId;
    updateModel((model) => {
      result = layoutMutations.addConnectorToViewAt(model, viewId, connectorId, x, y);
    });
    return result;
  };

  const removeElementFromView = (viewId: string, elementId: string): void => {
    updateModel((model) => layoutMutations.removeElementFromView(model, viewId, elementId));
  };

  const updateViewNodePosition = (viewId: string, elementId: string, x: number, y: number): void => {
    updateModel((model) => layoutMutations.updateViewNodePosition(model, viewId, elementId, x, y));
  };

  const updateViewNodePositionAny = (
    viewId: string,
    ref: { elementId?: string; connectorId?: string; objectId?: string },
    x: number,
    y: number
  ): void => {
    updateModel((model) => layoutMutations.updateViewNodePositionAny(model, viewId, ref, x, y));
  };

  const updateViewNodePositionsAny = (
    viewId: string,
    updates: Array<{ ref: { elementId?: string; connectorId?: string; objectId?: string }; x: number; y: number }>
  ): void => {
    updateModel((model) => layoutMutations.updateViewNodePositionsAny(model, viewId, updates));
  };

  const updateViewNodeLayoutAny = (
    viewId: string,
    ref: { elementId?: string; connectorId?: string; objectId?: string },
    patch: Partial<Omit<ViewNodeLayout, 'elementId' | 'connectorId' | 'objectId'>>
  ): void => {
    updateModel((model) => layoutMutations.updateViewNodeLayoutAny(model, viewId, ref, patch));
  };

  const alignViewElements = (viewId: string, elementIds: string[], mode: AlignMode): void => {
    updateModel((model) => alignMutations.alignViewElements(model, viewId, elementIds, mode));
  };

  const distributeViewElements = (viewId: string, elementIds: string[], mode: DistributeMode): void => {
    updateModel((model) => arrangeMutations.distributeViewElements(model, viewId, elementIds, mode));
  };

  const sameSizeViewElements = (viewId: string, elementIds: string[], mode: SameSizeMode): void => {
    updateModel((model) => arrangeMutations.sameSizeViewElements(model, viewId, elementIds, mode));
  };

  const fitViewElementsToText = (viewId: string, elementIds: string[]): void => {
    if (elementIds.length === 0) return;
    updateModel((model) => {
      const view = model.views[viewId];
      if (!view || view.kind !== 'archimate' || !view.layout) return;

      const idSet = new Set(elementIds);
      const updates: Array<{ elementId: string; width: number; height: number }> = [];

      for (const n of view.layout.nodes) {
        if (!n.elementId) continue;
        if (!idSet.has(n.elementId)) continue;
        const el = model.elements[n.elementId];
        if (!el) continue;
        const { width, height } = fitArchiMateBoxToText(el, n);
        updates.push({ elementId: n.elementId, width, height });
      }

      if (updates.length === 0) return;
      fitToTextMutations.applyViewElementSizes(model, viewId, updates);
    });
  };

  const autoLayoutView = async (
    viewId: string,
    options: AutoLayoutOptions = {},
    selectionNodeIds?: string[]
  ): Promise<void> => {
    const current = getModelOrThrow();

    const view = current.views[viewId];
    if (!view) throw new Error(`View not found: ${viewId}`);

    // Dedupe selection ids for determinism.
    const selection = Array.isArray(selectionNodeIds)
      ? Array.from(new Set(selectionNodeIds.filter((id) => typeof id === 'string' && id.length > 0))).sort((a, b) =>
          a.localeCompare(b)
        )
      : [];

    const extracted = extractLayoutInputForView(current, viewId, options, selection);
    if (extracted.nodes.length === 0) return;

    const hasHierarchy = extracted.nodes.some((n) => typeof n.parentId === 'string' && n.parentId.length > 0);
    const isBpmnHierarchical = view.kind === 'bpmn' && hasHierarchy;
    const isUmlHierarchical = view.kind === 'uml' && hasHierarchy;

    const readCurrentNodePos = (): Record<string, { x: number; y: number; width: number; height: number }> => {
      const fresh = getModel()?.views[viewId];
      const out: Record<string, { x: number; y: number; width: number; height: number }> = {};
      const rawNodes = fresh?.layout?.nodes ?? [];
      for (const n of rawNodes) {
        const id = n.elementId ?? n.connectorId;
        if (!id) continue;
        out[id] = { x: n.x, y: n.y, width: n.width, height: n.height };
      }
      return out;
    };

    const shouldSkipCommit = (
      positions: Record<string, { x: number; y: number }>,
      geometryById?: Record<string, { width?: number; height?: number }>,
      hasEdgeRoutes?: boolean
    ): boolean => {
      // If we have edge routes, play it safe and commit (routing may differ even if positions match).
      if (hasEdgeRoutes) return false;

      const cur = readCurrentNodePos();
      for (const [id, p] of Object.entries(positions)) {
        const c = cur[id];
        if (!c) return false;
        if (c.x !== p.x || c.y !== p.y) return false;
      }

      if (geometryById) {
        for (const [id, g] of Object.entries(geometryById)) {
          const c = cur[id];
          if (!c) return false;
          if (typeof g.width === 'number' && c.width !== g.width) return false;
          if (typeof g.height === 'number' && c.height !== g.height) return false;
        }
      }

      return true;
    };

    if (isBpmnHierarchical || isUmlHierarchical) {
      const { elkLayoutHierarchical } = await import('../../domain/layout/elk/elkLayoutHierarchical');

      const prepared = isBpmnHierarchical
        ? (await import('../../domain/layout/bpmn/prepareBpmnHierarchicalInput')).prepareBpmnHierarchicalInput(
            extracted,
            options
          )
        : (await import('../../domain/layout/uml/prepareUmlHierarchicalInput')).prepareUmlHierarchicalInput(
            extracted,
            options
          );

      const signature = computeLayoutSignature({
        viewId,
        viewKind: view.kind,
        mode: 'hierarchical',
        input: prepared.input,
        options,
        selectionNodeIds: selection,
      });

      const cached = autoLayoutCacheByView.get(viewId);
      const base =
        cached && cached.signature === signature ? cached.output : await elkLayoutHierarchical(prepared.input, options);
      if (!cached || cached.signature !== signature) {
        autoLayoutCacheByView.set(viewId, { signature, output: base });
      }

      // Clone output so we don't mutate cached results.
      const output = {
        positions: { ...base.positions },
        edgeRoutes: base.edgeRoutes ? { ...base.edgeRoutes } : undefined,
      };

      // Respect locked nodes (override positions) if requested.
      const fixedIds = new Set<string>();
      if (options.respectLocked) {
        const fresh = getModel()?.views[viewId];
        const rawNodes = fresh?.layout?.nodes ?? [];
        for (const n of rawNodes) {
          if (!n.locked) continue;
          const id = n.elementId ?? n.connectorId;
          if (!id) continue;
          fixedIds.add(id);
          output.positions[id] = { x: n.x, y: n.y };
        }
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

      if (shouldSkipCommit(snapped, geometryById, Boolean(edgeRoutes && Object.keys(edgeRoutes).length))) return;

      updateModel((model) => {
        autoLayoutMutations.autoLayoutViewGeometry(model, viewId, geometryById, edgeRoutes);
      });
      return;
    }

    // Lazy-load ELK so it doesn't get pulled into the main bundle until the user runs auto-layout.
    const { elkLayout } = await import('../../domain/layout/elk/elkLayout');

    const signature = computeLayoutSignature({
      viewId,
      viewKind: view.kind,
      mode: 'flat',
      input: extracted,
      options,
      selectionNodeIds: selection,
    });

    const cached = autoLayoutCacheByView.get(viewId);
    const base = cached && cached.signature === signature ? cached.output : await elkLayout(extracted, options);
    if (!cached || cached.signature !== signature) {
      autoLayoutCacheByView.set(viewId, { signature, output: base });
    }

    // Clone output so we don't mutate cached results.
    const output = {
      positions: { ...base.positions },
      edgeRoutes: base.edgeRoutes ? { ...base.edgeRoutes } : undefined,
    };

    // Post-pass tidy: keep pinned nodes fixed (if requested), snap to grid, then nudge overlaps.
    const fixedIds = new Set<string>();

    if (options.respectLocked) {
      const fresh = getModel()?.views[viewId];
      const rawNodes = fresh?.layout?.nodes ?? [];
      for (const n of rawNodes) {
        if (!n.locked) continue;
        const id = n.elementId ?? n.connectorId;
        if (!id) continue;
        fixedIds.add(id);
        output.positions[id] = { x: n.x, y: n.y };
      }
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

    if (shouldSkipCommit(positions, undefined, Boolean(edgeRoutes && Object.keys(edgeRoutes).length))) return;

    updateModel((model) => {
      autoLayoutMutations.autoLayoutView(model, viewId, positions, edgeRoutes);
    });
  };

  return {
    addElementToViewAt,
    addConnectorToViewAt,
    removeElementFromView,
    updateViewNodePosition,
    updateViewNodePositionAny,
    updateViewNodePositionsAny,
    updateViewNodeLayoutAny,
    alignViewElements,
    distributeViewElements,
    sameSizeViewElements,
    fitViewElementsToText,
    autoLayoutView,
  };
};

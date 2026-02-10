import type { AutoLayoutOptions } from '../../../../domain/layout/types';
import { extractLayoutInputForView } from '../../../../domain/layout';
import type { LayoutOpsDeps } from '../layoutOpsTypes';
import { dedupeSelectionIds, hasHierarchyInView } from './autoLayoutCommon';
import { runHierarchicalAutoLayout } from './hierarchicalAutoLayout';
import { runFlatAutoLayout } from './flatAutoLayout';

export type AutoLayoutOps = {
  autoLayoutView: (viewId: string, options?: AutoLayoutOptions, selectionNodeIds?: string[]) => Promise<void>;
};

export const createAutoLayoutOps = (deps: Pick<LayoutOpsDeps, 'getModel' | 'getModelOrThrow' | 'updateModel' | 'autoLayoutCacheByView'>): AutoLayoutOps => {
  const { getModel, getModelOrThrow, updateModel, autoLayoutCacheByView } = deps;

  const autoLayoutView = async (
    viewId: string,
    options: AutoLayoutOptions = {},
    selectionNodeIds?: string[]
  ): Promise<void> => {
    const current = getModelOrThrow();
    const view = current.views[viewId];
    if (!view) throw new Error(`View not found: ${viewId}`);

    const selection = dedupeSelectionIds(selectionNodeIds);
    const extracted = extractLayoutInputForView(current, viewId, options, selection);
    if (extracted.nodes.length === 0) return;

    const hasHierarchy = hasHierarchyInView(extracted.nodes);
    const isHierarchical = (view.kind === 'bpmn' || view.kind === 'uml') && hasHierarchy;

    if (isHierarchical) {
      const prepared = view.kind === 'bpmn'
        ? (await import('../../../../domain/layout/bpmn/prepareBpmnHierarchicalInput')).prepareBpmnHierarchicalInput(
            extracted,
            options
          )
        : (await import('../../../../domain/layout/uml/prepareUmlHierarchicalInput')).prepareUmlHierarchicalInput(
            extracted,
            options
          );

      await runHierarchicalAutoLayout({
        deps: { getModel, updateModel, autoLayoutCacheByView },
        viewId,
        viewKind: view.kind,
        prepared,
        options,
        selectionNodeIds: selection,
      });
      return;
    }

    await runFlatAutoLayout({
      deps: { getModel, updateModel, autoLayoutCacheByView },
      viewId,
      viewKind: view.kind,
      extracted,
      options,
      selectionNodeIds: selection,
    });
  };

  return { autoLayoutView };
};

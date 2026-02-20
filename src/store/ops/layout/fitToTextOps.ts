import { fitArchiMateBoxToText, fitBpmnBoxToText, fitUmlBoxToText } from '../../../domain/layout';
import { readStereotypes } from '../../../domain/umlStereotypes';
import { fitToTextMutations } from '../../mutations';
import type { LayoutOpsDeps } from './layoutOpsTypes';
import type { Element, Model, ViewNodeLayout } from '../../../domain/types';

/**
 * Ensure a parent container node never shrinks below the area needed for its nested nodes.
 *
 * We infer containment from semantic containment (Element.parentElementId).
 * This is notation-agnostic and fixes BPMN pool/lane shrink issues, and can help other notations too.
 */
function clampAndTightenToDescendants(opts: {
  model: Model;
  viewKind: 'archimate' | 'uml' | 'bpmn';
  parentNode: ViewNodeLayout;
  nodes: ViewNodeLayout[];
  nextWidth: number;
  nextHeight: number;
}): { x: number; y: number; width: number; height: number } {
  const { model, viewKind, parentNode, nodes, nextWidth, nextHeight } = opts;
  const parentElementId = parentNode.elementId;
  if (!parentElementId) return { x: parentNode.x, y: parentNode.y, width: nextWidth, height: nextHeight };

  const isDescendantOfParent = (el: Element | undefined): boolean => {
    let cur = el;
    let guard = 0;
    while (cur && cur.parentElementId && guard++ < 100) {
      if (cur.parentElementId === parentElementId) return true;
      cur = model.elements[cur.parentElementId];
    }
    return false;
  };

  const descendantNodes: ViewNodeLayout[] = [];
  for (const n of nodes) {
    if (!n.elementId) continue;
    if (n.elementId === parentElementId) continue;
    if (isDescendantOfParent(model.elements[n.elementId])) descendantNodes.push(n);
  }

  if (descendantNodes.length === 0)
    return { x: parentNode.x, y: parentNode.y, width: nextWidth, height: nextHeight };

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const c of descendantNodes) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x + c.width);
    maxY = Math.max(maxY, c.y + c.height);
  }

  // Provide some slack for headers/borders. Conservative default.
  const pad = 24;

  // Reserve extra space for parent labels (so they are not visually covered by nested nodes).
  // This is most noticeable for BPMN Pool and Lane where the title is rendered inside the container.
  // We do not move children here; instead we create extra margin on the left/top by moving the
  // container rect outward.
  let insetLeft = 0;
  let insetTop = 0;
  if (viewKind === 'bpmn') {
    const parentEl = model.elements[parentElementId];
    const t = parentEl?.type;
    // Pool uses a vertical title band on the left.
    if (t === 'bpmn.pool') insetLeft = 44;
    // Lane title is typically at the top-left.
    if (t === 'bpmn.lane') insetTop = 28;
  }

  // UML packages (and similar containers) render a label tab inside the container.
  // Reserve some top space so child nodes do not visually cover the tab text.
  if (viewKind === 'uml') {
    const parentEl = model.elements[parentElementId];
    const t = parentEl?.type;
    if (t === 'uml.package' || t === 'uml.profile' || t === 'uml.model') {
      const hasName = Boolean(parentEl?.name && String(parentEl.name).trim().length);
      const stereoCount = readStereotypes(parentEl?.attrs).length;
      // Give a bit more headroom when both stereotype and name are shown (two text rows).
      const extra = hasName && stereoCount > 0 ? 20 : 0;
      insetTop = Math.max(insetTop, 34 + extra);
    }
  }

  // Tighten top/left as well.
  // IMPORTANT: We intentionally allow desiredX/desiredY to move RIGHT/DOWN (increase) when
  // descendants are inset inside the container. This avoids leaving large empty margins above/left
  // after shrinking. Using Math.min(…) would only ever move LEFT/UP and does not solve that case.
  const desiredX = minX - pad - insetLeft;
  const desiredY = minY - pad - insetTop;
  const requiredWidth = Math.max(0, maxX - desiredX + pad);
  const requiredHeight = Math.max(0, maxY - desiredY + pad);

  return {
    x: desiredX,
    y: desiredY,
    width: Math.max(nextWidth, requiredWidth),
    height: Math.max(nextHeight, requiredHeight),
  };
}

export type FitToTextOps = {
  fitViewElementsToText: (viewId: string, elementIds: string[]) => void;
};

export const createFitToTextOps = (deps: Pick<LayoutOpsDeps, 'updateModel'>): FitToTextOps => {
  const { updateModel } = deps;

  const fitViewElementsToText = (viewId: string, elementIds: string[]): void => {
    if (elementIds.length === 0) return;

    updateModel((model) => {
      const view = model.views[viewId];
      if (!view || !view.layout) return;
      if (view.kind !== 'archimate' && view.kind !== 'uml' && view.kind !== 'bpmn') return;

      const idSet = new Set(elementIds);

      const depthOfElement = (elementId: string): number => {
        let depth = 0;
        let cur = model.elements[elementId];
        let guard = 0;
        while (cur?.parentElementId && guard++ < 100) {
          depth += 1;
          cur = model.elements[cur.parentElementId];
        }
        return depth;
      };

      // Work on a local copy of nodes so we can converge sizes within a single click.
      // This avoids relying on store mutations mid-loop (which can otherwise require repeated clicks).
      const baseNodes = view.layout.nodes;
      const nodes: ViewNodeLayout[] = baseNodes.map((n) => ({ ...n }));
      const indexByElementId = new Map<string, number>();
      for (let i = 0; i < nodes.length; i += 1) {
        const eid = nodes[i].elementId;
        if (eid) indexByElementId.set(eid, i);
      }

      const getNode = (elementId: string): ViewNodeLayout | undefined => {
        const idx = indexByElementId.get(elementId);
        return idx === undefined ? undefined : nodes[idx];
      };

      // When multiple nodes are selected, resize deepest children first and outer parents last.
      const selectedNodes = nodes
        .filter((n) => !!n.elementId && idSet.has(n.elementId))
        .slice()
        .sort((a, b) => depthOfElement((b.elementId as string)) - depthOfElement((a.elementId as string)));

      // Iterate until stable (or max iterations) so parents clamp against updated child sizes.
      const maxIterations = 12;
      for (let iter = 0; iter < maxIterations; iter += 1) {
        let changed = false;
        for (const n of selectedNodes) {
          const elId = n.elementId as string;
          const el = model.elements[elId];
          if (!el) continue;

          const curNode = getNode(elId);
          if (!curNode) continue;

          const sized =
            view.kind === 'archimate'
              ? fitArchiMateBoxToText(el, curNode)
              : view.kind === 'uml'
                ? fitUmlBoxToText(el, curNode, view.formatting)
                : fitBpmnBoxToText(el, curNode);

          if (!sized) continue;

          const tightened = clampAndTightenToDescendants({
            model,
            viewKind: view.kind,
            parentNode: curNode,
            nodes,
            nextWidth: sized.width,
            nextHeight: sized.height,
          });

          if (
            Math.abs(tightened.x - curNode.x) > 0.01 ||
            Math.abs(tightened.y - curNode.y) > 0.01 ||
            Math.abs(tightened.width - curNode.width) > 0.01 ||
            Math.abs(tightened.height - curNode.height) > 0.01
          ) {
            curNode.x = tightened.x;
            curNode.y = tightened.y;
            curNode.width = tightened.width;
            curNode.height = tightened.height;
            changed = true;
          }
        }
        if (!changed) break;
      }

      const updates: Array<{ elementId: string; x: number; y: number; width: number; height: number }> = [];
      for (const n of selectedNodes) {
        const elId = n.elementId as string;
        const baseIdx = indexByElementId.get(elId);
        if (baseIdx === undefined) continue;
        const base = baseNodes[baseIdx];
        const cur = getNode(elId);
        if (!base || !cur) continue;
        if (
          Math.abs(base.x - cur.x) > 0.01 ||
          Math.abs(base.y - cur.y) > 0.01 ||
          Math.abs(base.width - cur.width) > 0.01 ||
          Math.abs(base.height - cur.height) > 0.01
        ) {
          updates.push({ elementId: elId, x: cur.x, y: cur.y, width: cur.width, height: cur.height });
        }
      }

      if (updates.length === 0) return;
      fitToTextMutations.applyViewElementRects(model, viewId, updates);
    });
  };

  return { fitViewElementsToText };
};

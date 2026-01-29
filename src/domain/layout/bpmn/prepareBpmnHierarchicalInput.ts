import type { AutoLayoutOptions, LayoutDirection, LayoutInput, LayoutNodeInput } from '../types';

type SizeMap = Record<string, { width: number; height: number }>;

function isBpmnPool(kind?: string): boolean {
  return kind === 'bpmn.pool';
}

function isBpmnLane(kind?: string): boolean {
  return kind === 'bpmn.lane';
}

function isBpmnSubProcess(kind?: string): boolean {
  return kind === 'bpmn.subProcess';
}

function containerDirection(kind: string | undefined, global: LayoutDirection | undefined): LayoutDirection {
  if (isBpmnPool(kind)) return 'DOWN';
  // Lanes and subprocesses follow the global flow direction (default RIGHT).
  return global ?? 'RIGHT';
}

function containerPadding(kind: string | undefined): number {
  if (isBpmnPool(kind)) return 50;
  if (isBpmnLane(kind)) return 40;
  if (isBpmnSubProcess(kind)) return 40;
  return 40;
}

/**
 * Prepare a BPMN LayoutInput for hierarchical layout:
 * - Computes conservative container sizes so nested layout has room.
 * - Returns an updated node list + a size map for view geometry updates.
 */
export function prepareBpmnHierarchicalInput(input: LayoutInput, options: AutoLayoutOptions = {}): { input: LayoutInput; sizes: SizeMap } {
  const spacing = options.spacing ?? 80;

  const nodes: LayoutNodeInput[] = input.nodes.map((n) => ({ ...n }));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const childrenByParent = new Map<string, string[]>();
  for (const n of nodes) {
    if (!n.parentId) continue;
    if (!nodeById.has(n.parentId)) continue;
    const list = childrenByParent.get(n.parentId) ?? [];
    list.push(n.id);
    childrenByParent.set(n.parentId, list);
  }

  const sizes: SizeMap = {};
  const visiting = new Set<string>();

  const compute = (id: string): { width: number; height: number } => {
    const n = nodeById.get(id);
    if (!n) return { width: 0, height: 0 };
    if (sizes[id]) return sizes[id];
    if (visiting.has(id)) return { width: n.width, height: n.height };
    visiting.add(id);

    const childIds = childrenByParent.get(id) ?? [];
    if (childIds.length === 0) {
      sizes[id] = { width: n.width, height: n.height };
      visiting.delete(id);
      return sizes[id];
    }

    const dir = containerDirection(n.kind, options.direction);
    const pad = containerPadding(n.kind);

    const childSizes = childIds.map((cid) => ({ id: cid, size: compute(cid) }));

    let minW = 0;
    let minH = 0;

    if (dir === 'RIGHT') {
      // Horizontal flow: line up children left-to-right.
      const sumW = childSizes.reduce((acc, c) => acc + c.size.width, 0);
      const maxH = childSizes.reduce((acc, c) => Math.max(acc, c.size.height), 0);
      minW = sumW + spacing * Math.max(0, childSizes.length - 1) + pad * 2;
      minH = maxH + pad * 2;
    } else {
      // Vertical: stack children top-to-bottom.
      const sumH = childSizes.reduce((acc, c) => acc + c.size.height, 0);
      const maxW = childSizes.reduce((acc, c) => Math.max(acc, c.size.width), 0);
      minW = maxW + pad * 2;
      minH = sumH + spacing * Math.max(0, childSizes.length - 1) + pad * 2;
    }

    // Grow (never shrink) for safety.
    n.width = Math.max(n.width, minW);
    n.height = Math.max(n.height, minH);

    sizes[id] = { width: n.width, height: n.height };
    visiting.delete(id);
    return sizes[id];
  };

  // Compute sizes for all nodes (containers first via recursion).
  for (const n of nodes) {
    compute(n.id);
  }

  return { input: { ...input, nodes }, sizes };
}

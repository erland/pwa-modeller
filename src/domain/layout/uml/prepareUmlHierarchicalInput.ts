import type { AutoLayoutOptions, LayoutInput, LayoutNodeInput } from '../types';

type SizeMap = Record<string, { width: number; height: number }>;

function isUmlPackage(kind?: string): boolean {
  return kind === 'uml.package';
}

function containerPadding(kind?: string): number {
  // Packages (and potential future frames) get a bit of breathing room.
  if (isUmlPackage(kind)) return 40;
  return 40;
}

/**
 * Prepare a UML LayoutInput for hierarchical layout:
 * - Computes conservative container sizes so nested layout has room.
 * - Returns an updated node list + a size map for view geometry updates.
 */
export function prepareUmlHierarchicalInput(input: LayoutInput, options: AutoLayoutOptions = {}): { input: LayoutInput; sizes: SizeMap } {
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

    const pad = containerPadding(n.kind);
    const childSizes = childIds.map((cid) => ({ id: cid, size: compute(cid) }));

    // For UML packages, allow a "row" of children by default.
    const sumW = childSizes.reduce((acc, c) => acc + c.size.width, 0);
    const maxH = childSizes.reduce((acc, c) => Math.max(acc, c.size.height), 0);
    const minW = sumW + spacing * Math.max(0, childSizes.length - 1) + pad * 2;
    const minH = maxH + pad * 2;

    // Grow (never shrink) for safety.
    n.width = Math.max(n.width, minW);
    n.height = Math.max(n.height, minH);

    sizes[id] = { width: n.width, height: n.height };
    visiting.delete(id);
    return sizes[id];
  };

  for (const n of nodes) {
    compute(n.id);
  }

  return { input: { ...input, nodes }, sizes };
}

import type { IRElement, IRViewNode } from '../../import/framework/ir';

/**
 * Apply a simple, safe z-order policy:
 * - "Container" elements are placed first in DOM order and assigned low negative zIndex values.
 * - Larger containers are pushed further back.
 * - Non-container ordering remains stable.
 */
export function applyContainerZOrder(
  nodes: IRViewNode[],
  elementById: Map<string, IRElement>,
  isContainerElementType: (type: string | undefined) => boolean,
  options?: { containerBaseZ?: number }
) {
  type Info = { node: IRViewNode; area: number; isContainer: boolean; key: string };

  const infos: Info[] = nodes.map((n) => {
    const b = n.bounds;
    const area = b ? Math.max(0, b.width) * Math.max(0, b.height) : 0;
    const elType = n.elementId ? elementById.get(n.elementId)?.type : undefined;
    const isContainer = isContainerElementType(elType);
    const key = (n.elementId ?? n.id) as string;
    return { node: n, area, isContainer, key };
  });

  infos.sort((a, b) => {
    if (a.isContainer !== b.isContainer) return a.isContainer ? -1 : 1;
    if (a.isContainer && b.isContainer) {
      // Larger containers first (so they're further back once assigned zIndex).
      if (a.area !== b.area) return b.area - a.area;
      return a.key.localeCompare(b.key);
    }
    // Non-containers: stable by key.
    return a.key.localeCompare(b.key);
  });

  const ordered = infos.map((i) => i.node);

  // Assign explicit zIndex to containers so renderers can layer reliably.
  const containerBase = options?.containerBaseZ ?? -1000;
  let containerRank = 0;
  for (const info of infos) {
    if (!info.isContainer) continue;
    const n = info.node;
    n.meta = { ...(n.meta ?? {}), zIndex: containerBase - containerRank };
    containerRank++;
  }

  nodes.splice(0, nodes.length, ...ordered);
}

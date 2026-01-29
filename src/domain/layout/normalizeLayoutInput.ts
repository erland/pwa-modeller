import type { LayoutInput, LayoutNodeInput, LayoutEdgeInput, LayoutPortHint } from './types';

function sortPorts(ports: LayoutPortHint[] | undefined): LayoutPortHint[] | undefined {
  if (!ports || ports.length === 0) return ports;
  return [...ports].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Normalize a layout input graph for determinism.
 *
 * - Stable-sort nodes by id
 * - Stable-sort edge list by (sourceId, targetId, weight desc, id)
 * - Stable-sort ports within each node
 */
export function normalizeLayoutInput(input: LayoutInput): LayoutInput {
  const nodes: LayoutNodeInput[] = [...input.nodes]
    .map((n) => ({ ...n, ...(n.ports ? { ports: sortPorts(n.ports) } : {}) }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const edges: LayoutEdgeInput[] = [...input.edges].sort((a, b) => {
    const s = a.sourceId.localeCompare(b.sourceId);
    if (s !== 0) return s;
    const t = a.targetId.localeCompare(b.targetId);
    if (t !== 0) return t;
    const aw = a.weight ?? 0;
    const bw = b.weight ?? 0;
    if (aw !== bw) return bw - aw;
    return a.id.localeCompare(b.id);
  });

  const groups = input.groups ? [...input.groups].sort((a, b) => a.id.localeCompare(b.id)) : undefined;

  return { nodes, edges, ...(groups ? { groups } : {}) };
}

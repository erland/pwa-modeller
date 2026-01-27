import type { Model, View, ViewNodeLayout, ViewObjectType } from '../../../domain';

/**
 * Conservative z-order normalization for view nodes.
 *
 * Goal: avoid large container-like shapes (e.g. GroupBox, UML Package frames) covering smaller nodes after import.
 *
 * Strategy:
 * - Categorize nodes into background / normal / overlay.
 * - Within each category, enforce containment ordering: containers render behind contained nodes.
 * - Assign deterministic zIndex values (higher renders on top).
 */
export function fixViewZOrder(model: Model, view: View): ViewNodeLayout[] {
  const nodes = view.layout?.nodes ?? [];
  if (nodes.length === 0) return nodes;

  type NodeInfo = {
    idx: number;
    node: ViewNodeLayout;
    id: string; // stable key: elementId|connectorId|objectId
    cat: 0 | 1 | 2;
    x: number;
    y: number;
    w: number;
    h: number;
    area: number;
  };

  const objects = view.objects ?? {};
  const nodeInfos: NodeInfo[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (typeof n.x !== 'number' || typeof n.y !== 'number' || typeof n.width !== 'number' || typeof n.height !== 'number') {
      continue;
    }

    const key = n.elementId
      ? `el:${n.elementId}`
      : n.connectorId
        ? `con:${n.connectorId}`
        : n.objectId
          ? `obj:${n.objectId}`
          : `idx:${i}`;

    const cat = categorizeNode(model, n, objects) as 0 | 1 | 2;

    nodeInfos.push({
      idx: i,
      node: n,
      id: key,
      cat,
      x: n.x,
      y: n.y,
      w: n.width,
      h: n.height,
      area: Math.max(0, n.width) * Math.max(0, n.height),
    });
  }

  if (nodeInfos.length === 0) return nodes;

  // Partition by category and sort inside by stable topo sort.
  const byCat: Record<0 | 1 | 2, NodeInfo[]> = { 0: [], 1: [], 2: [] };
  for (const ni of nodeInfos) byCat[ni.cat].push(ni);

  const fixed = new Map<string, number>(); // key -> zIndex

  const base: Record<0 | 1 | 2, number> = { 0: 0, 1: 10000, 2: 20000 };

  for (const cat of [0, 1, 2] as const) {
    const list = byCat[cat];
    if (list.length === 0) continue;

    const order = topoSortByContainment(list);
    for (let j = 0; j < order.length; j++) {
      fixed.set(order[j].id, base[cat] + j);
    }
  }

  // Apply zIndex back to nodes. Preserve nodes we skipped (no bounds) untouched.
  return nodes.map((n, i) => {
    const key = n.elementId
      ? `el:${n.elementId}`
      : n.connectorId
        ? `con:${n.connectorId}`
        : n.objectId
          ? `obj:${n.objectId}`
          : `idx:${i}`;
    const z = fixed.get(key);
    return z === undefined ? n : { ...n, zIndex: z };
  });
}

function categorizeNode(
  model: Model,
  n: ViewNodeLayout,
  objects: Record<string, { type: ViewObjectType }>
): 0 | 1 | 2 {
  // View-local objects
  if (n.objectId) {
    const obj = objects[n.objectId];
    const t = obj?.type;
    if (t === 'GroupBox' || t === 'Divider') return 0; // background
    if (t === 'Label' || t === 'Note') return 2; // overlay
    return 1;
  }

  if (n.elementId) {
    const el = model.elements[n.elementId];
    const type = (el?.type ?? '').toString();

    // UML package/frame-like nodes are common "big containers".
    if (type === 'uml.package' || type === 'uml.subject') return 0;

    // Notes in UML should render on top of regular nodes.
    if (type === 'uml.note') return 2;

    // ArchiMate containers (Grouping/Location) tend to behave like background frames.
    if (type === 'Grouping' || type === 'Location') return 0;
  }

  return 1;
}

function topoSortByContainment(list: Array<{ id: string; idx: number; x: number; y: number; w: number; h: number; area: number }>) {
  // Build containment edges within this category: container -> contained (container behind).
  // We keep it conservative to avoid rearranging unrelated overlaps.
  const n = list.length;
  const edges: Map<string, Set<string>> = new Map();
  const indeg: Map<string, number> = new Map();
  for (const a of list) {
    edges.set(a.id, new Set());
    indeg.set(a.id, 0);
  }

  for (let i = 0; i < n; i++) {
    const A = list[i];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const B = list[j];

      // Only consider A as a container for B if A is significantly larger than B.
      if (A.area <= B.area * 1.2) continue;

      if (containsMostly(A, B)) {
        const out = edges.get(A.id)!;
        if (!out.has(B.id)) {
          out.add(B.id);
          indeg.set(B.id, (indeg.get(B.id) ?? 0) + 1);
        }
      }
    }
  }

  // Kahn with stable ordering: prefer earlier imported nodes when free.
  const available: Array<{ id: string; idx: number }> = [];
  for (const a of list) {
    if ((indeg.get(a.id) ?? 0) === 0) available.push({ id: a.id, idx: a.idx });
  }
  available.sort((p, q) => p.idx - q.idx);

  const idToNode = new Map(list.map((x) => [x.id, x]));
  const result: typeof list = [];

  const popFirst = () => available.shift();

  while (available.length > 0) {
    const cur = popFirst()!;
    const node = idToNode.get(cur.id);
    if (node) result.push(node);

    for (const to of edges.get(cur.id) ?? []) {
      indeg.set(to, (indeg.get(to) ?? 1) - 1);
      if ((indeg.get(to) ?? 0) === 0) {
        available.push({ id: to, idx: idToNode.get(to)?.idx ?? Number.MAX_SAFE_INTEGER });
      }
    }
    available.sort((p, q) => p.idx - q.idx);
  }

  // If cycle (should be rare with conservative edges), fall back to original order.
  if (result.length !== list.length) {
    return [...list].sort((a, b) => a.idx - b.idx);
  }

  return result;
}

function containsMostly(
  A: { x: number; y: number; w: number; h: number },
  B: { x: number; y: number; w: number; h: number }
): boolean {
  const margin = 2;
  const ax1 = A.x - margin;
  const ay1 = A.y - margin;
  const ax2 = A.x + A.w + margin;
  const ay2 = A.y + A.h + margin;

  const bx1 = B.x;
  const by1 = B.y;
  const bx2 = B.x + B.w;
  const by2 = B.y + B.h;

  // Fully inside (with small margin)
  if (bx1 >= ax1 && by1 >= ay1 && bx2 <= ax2 && by2 <= ay2) return true;

  // Mostly inside (intersection covers most of B). This helps when bounds are slightly off.
  const ix1 = Math.max(ax1, bx1);
  const iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);

  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const interArea = iw * ih;
  const bArea = Math.max(0, B.w) * Math.max(0, B.h);
  if (bArea <= 0) return false;

  return interArea / bArea >= 0.92;
}

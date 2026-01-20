import type { IRId, IRView, IRViewNode } from '../../framework/ir';

// --- Step 5C (BPMN): Apply Pool/Lane containment based on geometry ---

type Rect = { l: number; t: number; r: number; b: number; area: number; nodeId: string };

type TypedNode = {
  node: IRViewNode;
  idx: number;
  typeId: string;
  rect: Rect;
};

function rectFromBounds(nodeId: string, b: { x: number; y: number; width: number; height: number }): Rect {
  const l = b.x;
  const t = b.y;
  const r = b.x + b.width;
  const bb = b.y + b.height;
  const area = Math.max(0, b.width) * Math.max(0, b.height);
  return { l, t, r, b: bb, area, nodeId };
}

function rectContains(outer: Rect, inner: Rect, tol = 0): boolean {
  return outer.l - tol <= inner.l && outer.t - tol <= inner.t && outer.r + tol >= inner.r && outer.b + tol >= inner.b;
}

function pickSmallestContainer(child: Rect, containers: Rect[]): Rect | undefined {
  let best: Rect | undefined;
  for (const c of containers) {
    if (!rectContains(c, child, 0)) continue;
    if (!best || c.area < best.area) best = c;
  }
  return best;
}

export function applyBpmnContainmentToViews(views: IRView[] | undefined, elements: { id: IRId; type: unknown }[]): IRView[] | undefined {
  if (!views) return views;

  const elTypeById = new Map<IRId, string>();
  for (const e of elements) {
    if (!e?.id) continue;
    if (typeof e.type === 'string' && e.type.trim()) elTypeById.set(e.id, e.type);
  }

  return views.map((v) => {
    const nodes = v.nodes ?? [];

    const typed: TypedNode[] = [];
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]!;
      if (!n?.id || !n.elementId || !n.bounds) continue;
      const t = elTypeById.get(n.elementId);
      if (!t) continue;
      typed.push({ node: n, idx: i, typeId: t, rect: rectFromBounds(n.id, n.bounds) });
    }

    const hasBpmnContainers = typed.some((x) => x.typeId === 'bpmn.pool' || x.typeId === 'bpmn.lane');
    if (!hasBpmnContainers) return v;

    const pools = typed.filter((x) => x.typeId === 'bpmn.pool').map((x) => x.rect);
    const lanes = typed.filter((x) => x.typeId === 'bpmn.lane').map((x) => x.rect);

    const parentByNodeId = new Map<string, IRId | null>();

    // Lanes belong to the smallest pool that fully contains them.
    for (const x of typed) {
      if (x.typeId !== 'bpmn.lane') continue;
      const p = pickSmallestContainer(x.rect, pools);
      if (p) parentByNodeId.set(x.node.id, p.nodeId);
    }

    // Other BPMN nodes belong to the smallest lane that contains them; otherwise the smallest pool.
    for (const x of typed) {
      if (!x.typeId.startsWith('bpmn.')) continue;
      if (x.typeId === 'bpmn.pool' || x.typeId === 'bpmn.lane') continue;

      const l = pickSmallestContainer(x.rect, lanes);
      if (l) {
        parentByNodeId.set(x.node.id, l.nodeId);
        continue;
      }

      const p = pickSmallestContainer(x.rect, pools);
      if (p) parentByNodeId.set(x.node.id, p.nodeId);
    }

    const nextNodes = nodes.map((n) => {
      if (!n?.id) return n;
      if (!parentByNodeId.has(n.id)) return n;
      return { ...n, parentNodeId: parentByNodeId.get(n.id) };
    });

    // Stable ordering: containers first (pool, lane), then BPMN nodes, then the rest.
    const rank = (n: IRViewNode): number => {
      const t = n.elementId ? elTypeById.get(n.elementId) : undefined;
      if (t === 'bpmn.pool') return 0;
      if (t === 'bpmn.lane') return 1;
      if (t && t.startsWith('bpmn.')) return 2;
      return 3;
    };

    const sorted = nextNodes
      .map((n, i) => ({ n, i }))
      .sort((a, b) => {
        const ra = rank(a.n);
        const rb = rank(b.n);
        if (ra !== rb) return ra - rb;
        return a.i - b.i;
      })
      .map((x) => x.n);

    return { ...v, nodes: sorted };
  });
}

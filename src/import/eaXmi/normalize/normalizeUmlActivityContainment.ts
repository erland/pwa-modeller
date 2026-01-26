import type { IRElement, IRId, IRModel, IRView } from '../../framework/ir';

// UML Activity ownership hints.
// We keep this deliberately lightweight for v1: view-driven detection of a single
// containing `uml.activity` element in Activity-ish diagrams.

const UML_ACTIVITY_TYPE = 'uml.activity';

const UML_ACTIVITY_NODE_TYPES = new Set<string>([
  'uml.action',
  'uml.initialNode',
  'uml.activityFinalNode',
  'uml.flowFinalNode',
  'uml.decisionNode',
  'uml.mergeNode',
  'uml.forkNode',
  'uml.joinNode',
  'uml.objectNode'
]);

function isActivityishView(v: IRView): boolean {
  const vp = (v.viewpoint ?? '').toString().toLowerCase();
  // EA diagram type strings vary; be forgiving.
  return vp.includes('activity') || vp.includes('umlactivity');
}

function area(bounds: { width: number; height: number } | undefined): number {
  if (!bounds) return 0;
  const a = bounds.width * bounds.height;
  return Number.isFinite(a) ? a : 0;
}

function pickActivityContainerId(v: IRView, elementsById: Map<IRId, IRElement>): IRId | undefined {
  const candidates: { id: IRId; a: number }[] = [];

  for (const n of v.nodes ?? []) {
    if (!n?.elementId) continue;
    const el = elementsById.get(n.elementId);
    if (!el) continue;
    if (el.type !== UML_ACTIVITY_TYPE) continue;
    candidates.push({ id: el.id, a: area(n.bounds) });
  }

  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0]!.id;

  // Prefer the one that looks like a container (largest bounds).
  candidates.sort((x, y) => y.a - x.a);
  return candidates[0]!.id;
}

function uniq<T>(arr: T[]): T[] {
  const out: T[] = [];
  const seen = new Set<T>();
  for (const a of arr) {
    if (seen.has(a)) continue;
    seen.add(a);
    out.push(a);
  }
  return out;
}

/**
 * Step 3 (UML Activity): add lightweight ownership hints.
 *
 * Output semantics:
 * - For Activity-ish views that contain exactly one `uml.activity` element (or a best-effort pick),
 *   all Activity-node elements in that view receive `attrs.activityId = <activityElementId>`.
 * - The Activity element receives `attrs.ownedNodeRefs = string[]` with the IR ids of those nodes.
 */
export function normalizeUmlActivityContainment(ir: IRModel, views: IRView[] | undefined): IRElement[] {
  const elements = ir.elements ?? [];
  if (!views?.length || !elements.length) return elements;

  const elementsById = new Map<IRId, IRElement>();
  for (const e of elements) {
    if (e?.id) elementsById.set(e.id, e);
  }

  const ownedByActivity = new Map<IRId, IRId[]>();

  for (const v of views) {
    if (!v) continue;
    if (!isActivityishView(v)) continue;

    const activityId = pickActivityContainerId(v, elementsById);
    if (!activityId) continue;

    const owned: IRId[] = [];
    for (const n of v.nodes ?? []) {
      if (!n?.elementId) continue;
      const el = elementsById.get(n.elementId);
      if (!el) continue;
      if (!UML_ACTIVITY_NODE_TYPES.has(el.type)) continue;
      owned.push(el.id);
    }
    if (!owned.length) continue;

    ownedByActivity.set(activityId, uniq([...(ownedByActivity.get(activityId) ?? []), ...owned]));
  }

  if (ownedByActivity.size === 0) return elements;

  return elements.map((e) => {
    if (!e?.id) return e;

    // If this is an Activity element, attach owned nodes.
    const owned = ownedByActivity.get(e.id);
    if (owned && e.type === UML_ACTIVITY_TYPE) {
      const nextAttrs = (e.attrs && typeof e.attrs === 'object' ? { ...(e.attrs as any) } : {}) as any;
      nextAttrs.ownedNodeRefs = owned;
      return { ...e, attrs: nextAttrs };
    }

    // If this is an Activity node, attach its activityId.
    if (UML_ACTIVITY_NODE_TYPES.has(e.type)) {
      // Pick the first activity that claims ownership of this node.
      let activityId: IRId | undefined;
      for (const [aId, nodes] of ownedByActivity.entries()) {
        if (nodes.includes(e.id)) {
          activityId = aId;
          break;
        }
      }
      if (!activityId) return e;

      const nextAttrs = (e.attrs && typeof e.attrs === 'object' ? { ...(e.attrs as any) } : {}) as any;
      if (!nextAttrs.activityId) nextAttrs.activityId = activityId;
      return { ...e, attrs: nextAttrs };
    }

    return e;
  });
}

import type { Model } from '../types';

/**
 * Pure containment helpers for the canonical model-level hierarchy:
 * Element.parentElementId (0..1).
 */

export type ChildrenIndex = Map<string | null, string[]>;

export function getParent(model: Model, elementId: string): string | undefined {
  return model.elements[elementId]?.parentElementId;
}

/**
 * Builds a children index keyed by parent element id.
 *
 * - key `null` represents the conceptual "root" (no parentElementId)
 * - missing/invalid parents are treated as root for indexing purposes
 */
export function buildChildrenIndex(model: Model): ChildrenIndex {
  const idx: ChildrenIndex = new Map();
  idx.set(null, []);

  for (const [id, el] of Object.entries(model.elements)) {
    const rawParent = el.parentElementId;
    const parentId = rawParent && model.elements[rawParent] ? rawParent : null;
    if (!idx.has(parentId)) idx.set(parentId, []);
    idx.get(parentId)!.push(id);
  }

  // Deterministic ordering: by name, then id
  for (const [parentId, children] of idx.entries()) {
    children.sort((a, b) => {
      const ea = model.elements[a];
      const eb = model.elements[b];
      const an = (ea?.name ?? '').toLocaleLowerCase();
      const bn = (eb?.name ?? '').toLocaleLowerCase();
      if (an < bn) return -1;
      if (an > bn) return 1;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    idx.set(parentId, children);
  }

  return idx;
}

/**
 * Returns ancestor ids starting from the immediate parent up to the root.
 * If the chain is broken (missing parent) or a cycle is detected, traversal stops.
 */
export function getAncestors(model: Model, elementId: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>([elementId]);

  let cur = elementId;
  while (true) {
    const p = model.elements[cur]?.parentElementId;
    if (!p) break;
    if (!model.elements[p]) break;
    if (seen.has(p)) break;
    out.push(p);
    seen.add(p);
    cur = p;
  }

  return out;
}

export function isAncestor(model: Model, ancestorId: string, descendantId: string): boolean {
  if (ancestorId === descendantId) return false;
  return getAncestors(model, descendantId).includes(ancestorId);
}

/**
 * Returns all descendants (depth-first) of elementId.
 * If a cycle exists, it is guarded against by a visited set.
 */
export function getDescendants(model: Model, elementId: string): string[] {
  const idx = buildChildrenIndex(model);
  const out: string[] = [];
  const visited = new Set<string>([elementId]);

  const stack: string[] = [...(idx.get(elementId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    out.push(id);
    const kids = idx.get(id);
    if (kids && kids.length) {
      for (const k of kids) stack.push(k);
    }
  }

  return out;
}

export type CanSetParentResult = { ok: true } | { ok: false; reason: string };

export function canSetParent(model: Model, childId: string, newParentId: string | null): CanSetParentResult {
  const child = model.elements[childId];
  if (!child) return { ok: false, reason: `Unknown child element: ${childId}` };

  if (newParentId === null) return { ok: true };

  if (newParentId === childId) return { ok: false, reason: 'An element cannot be its own parent.' };

  const parent = model.elements[newParentId];
  if (!parent) return { ok: false, reason: `Unknown parent element: ${newParentId}` };

  // Prevent cycles: you cannot set parent to any of your descendants.
  if (isAncestor(model, childId, newParentId)) {
    return { ok: false, reason: 'Cannot set parent to a descendant (would create a cycle).' };
  }

  return { ok: true };
}

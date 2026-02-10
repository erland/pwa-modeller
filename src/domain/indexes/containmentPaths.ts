import type { Element, Model } from '../types';
import { buildChildrenIndex } from '../containment/containment';

export type ElementParentIndex = Map<string, string | null>; // elementId -> parentElementId (null for root)
export type ElementChildrenIndex = Map<string | null, string[]>; // parentElementId|null -> child ids

export type ElementPathOptions = {
  /** Separator used between element names. Default: ' / '. */
  separator?: string;
  /** Whether to include the element itself as the last segment. Default: true. */
  includeSelf?: boolean;
  /** Optional fallback for missing element names. Default: element id. */
  missingNameFallback?: (elementId: string) => string;
};

/** Build elementId -> parentElementId index (null for root). */
export function buildElementParentIndex(model: Model): ElementParentIndex {
  const idx: ElementParentIndex = new Map();
  for (const [id, el] of Object.entries(model.elements ?? {})) {
    const p = (el as Element).parentElementId;
    idx.set(id, p ? String(p) : null);
  }
  return idx;
}

/** Build parentElementId -> children ids index (null = root). */
export function buildElementChildrenIndex(model: Model): ElementChildrenIndex {
  // Reuse the domain containment helper (stable ordering).
  return buildChildrenIndex(model);
}

/**
 * Return the containment path as element ids from root → … → elementId.
 *
 * Guards against cycles. Missing parents stop the chain.
 */
export function getElementContainmentPathIds(
  model: Model,
  elementId: string,
  parentIdx?: ElementParentIndex,
  options: Pick<ElementPathOptions, 'includeSelf'> = {}
): string[] {
  const includeSelf = options.includeSelf !== false;
  const pIdx = parentIdx ?? buildElementParentIndex(model);
  const visited = new Set<string>();

  const chain: string[] = [];
  let cur: string | null = includeSelf ? elementId : (pIdx.get(elementId) ?? null);
  let guard = 0;
  while (cur && !visited.has(cur) && guard++ < 1000) {
    visited.add(cur);
    chain.push(cur);
    cur = pIdx.get(cur) ?? null;
  }
  return chain.reverse();
}

/**
 * Convenience: containment path as a human label (uses element names).
 */
export function getElementContainmentPathLabel(
  model: Model,
  elementId: string,
  parentIdx?: ElementParentIndex,
  options: ElementPathOptions = {}
): string {
  const sep = options.separator ?? ' / ';
  const fallback = options.missingNameFallback ?? ((id: string) => id);
  const ids = getElementContainmentPathIds(model, elementId, parentIdx, { includeSelf: options.includeSelf });
  const parts = ids.map((id) => {
    const el = model.elements?.[id];
    const name = (el?.name ?? '').trim();
    return name ? name : fallback(id);
  });
  return parts.join(sep);
}

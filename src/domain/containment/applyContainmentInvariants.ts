import type { Model } from '../types';
import { buildChildrenIndex } from './containment';

/**
 * Defensive invariant pass for element containment.
 *
 * - parentElementId must refer to an existing element (otherwise cleared)
 * - parentElementId must not refer to self
 * - no cycles: if a cycle is detected, we detach the offending edge to root
 */
export function applyContainmentInvariants(model: Model): Model {
  const elements = model.elements;

  // Copy only if we end up changing something.
  let changed = false;
  const nextElements: Record<string, typeof elements[string]> = { ...elements };

  // Normalize missing parents & self-parent
  for (const [id, el] of Object.entries(elements)) {
    const p = el.parentElementId;
    if (!p) continue;
    if (p === id || !elements[p]) {
      changed = true;
      nextElements[id] = { ...el, parentElementId: undefined };
    }
  }

  // Cycle breaking: walk parent chains and detach the edge that closes the loop.
  // We do this over the (potentially) updated map.
  const parentOf = (id: string): string | undefined => nextElements[id]?.parentElementId;

  for (const id of Object.keys(nextElements)) {
    const onPath = new Set<string>([id]);
    let cur = id;

    while (true) {
      const p = parentOf(cur);
      if (!p) break;
      if (!nextElements[p]) {
        // Shouldn't happen after normalize, but keep defensive.
        if (nextElements[cur]?.parentElementId) {
          changed = true;
          nextElements[cur] = { ...nextElements[cur], parentElementId: undefined };
        }
        break;
      }
      if (p === cur) {
        changed = true;
        nextElements[cur] = { ...nextElements[cur], parentElementId: undefined };
        break;
      }
      if (onPath.has(p)) {
        // Detach the edge from `cur` -> `p` to break the cycle.
        changed = true;
        nextElements[cur] = { ...nextElements[cur], parentElementId: undefined };
        break;
      }
      onPath.add(p);
      cur = p;
    }
  }

  // Optional: if we changed, rebuild children index once to ensure it can be built without throwing.
  // (also forces TS to keep the helper referenced; handy for early smoke tests)
  if (changed) {
    buildChildrenIndex({ ...model, elements: nextElements });
    return { ...model, elements: nextElements };
  }
  return model;
}

import type { Model } from '../../domain';
import {
  buildOverlayModelExternalIdIndex,
  getExternalRefsForElement,
  getExternalRefsForRelationship,
  getUniqueExternalRefsForTarget,
  type ModelTargetRef
} from '../../domain/overlay';
import { externalKey } from '../../domain/externalIds';
import { normalizeOverlayRefs, toExternalIdRef, toOverlayExternalRef } from '../../domain/overlay';
import type { OverlayStore } from './OverlayStore';

export type RebindOverlayEntryOptions = {
  /** If true, replaces the entry's refs with refs derived from the chosen target. Default: true. */
  replaceRefs?: boolean;
  /** If true, uses only target refs that uniquely identify the target (when available). Default: true. */
  preferUniqueRefs?: boolean;
};

export type RebindOverlayEntryResult =
  | { ok: true; usedExternalKeys: string[]; usedUniqueRefs: boolean; refCount: number }
  | { ok: false; reason: 'entry-not-found' | 'target-not-found' | 'target-has-no-external-ids' };

function overlayRefsFromExternalRefs(refs: Array<{ system: string; id: string; scope?: string }>) {
  return normalizeOverlayRefs(refs.map((r) => toOverlayExternalRef(r)));
}

function externalRefsForTarget(model: Model, target: ModelTargetRef): Array<{ system: string; id: string; scope?: string }> {
  if (target.kind === 'element') {
    const el = model.elements?.[target.id];
    return el ? getExternalRefsForElement(el) : [];
  }
  const rel = model.relationships?.[target.id];
  return rel ? getExternalRefsForRelationship(rel) : [];
}

/**
 * Rebind an overlay entry to a chosen model target by updating its refs (and kind).
 *
 * This works by selecting a set of external refs from the chosen target and writing them
 * back into the overlay entry. Overlay resolution uses these refs to attach the entry.
 */
export function rebindOverlayEntryToTarget(
  overlayStore: OverlayStore,
  model: Model,
  entryId: string,
  target: ModelTargetRef,
  options?: RebindOverlayEntryOptions
): RebindOverlayEntryResult {
  const entry = overlayStore.getEntry(entryId);
  if (!entry) return { ok: false, reason: 'entry-not-found' };

  const idx = buildOverlayModelExternalIdIndex(model);
  const allRefs = externalRefsForTarget(model, target);
  const targetExists = target.kind === 'element' ? !!model.elements?.[target.id] : !!model.relationships?.[target.id];
  if (!targetExists) return { ok: false, reason: 'target-not-found' };
  if (allRefs.length === 0) return { ok: false, reason: 'target-has-no-external-ids' };

  const preferUnique = options?.preferUniqueRefs !== false;
  const uniqueRefs = preferUnique ? getUniqueExternalRefsForTarget(model, idx, target) : [];
  const chosen = uniqueRefs.length ? uniqueRefs : allRefs;

  const replaceRefs = options?.replaceRefs !== false;
  const chosenOverlayRefs = overlayRefsFromExternalRefs(chosen);
  const nextRefs = replaceRefs
    ? chosenOverlayRefs
    : normalizeOverlayRefs([...(entry.target.externalRefs ?? []), ...chosenOverlayRefs]);

  overlayStore.upsertEntry({
    entryId: entry.entryId,
    kind: target.kind,
    externalRefs: nextRefs
  });

  const keys: string[] = [];
  for (const r of nextRefs) {
    const k = externalKey(toExternalIdRef(r));
    if (k) keys.push(k);
  }

  return {
    ok: true,
    usedExternalKeys: keys.sort(),
    usedUniqueRefs: uniqueRefs.length > 0,
    refCount: nextRefs.length
  };
}

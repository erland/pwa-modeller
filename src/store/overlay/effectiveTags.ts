import type { Element, ExternalIdRef, Model, Relationship, TaggedValue } from '../../domain';
import { dedupeExternalIds, externalKey } from '../../domain/externalIds';
import type { OverlayTagValue } from '../../domain/overlay';
import { mergeTaggedValuesWithOverlay } from '../../domain/overlay';

import type { OverlayStore, OverlayStoreEntry } from './OverlayStore';

export type OverlayMatchInfo =
  | { kind: 'none' }
  | { kind: 'single'; entryId: string }
  | { kind: 'multiple'; entryIds: string[] };

export type EffectiveTagsResult = {
  /** Effective tagged values (core with overridden keys removed, plus overlay tags). */
  effectiveTaggedValues: TaggedValue[];
  /** Overlay tags merged from the matching entry/entries (empty when none). */
  overlayTags: Record<string, OverlayTagValue>;
  /** Which overlay entry/entries matched the target. */
  overlayMatch: OverlayMatchInfo;
  /** Keys for which overlay overrides one or more core tagged values. */
  overriddenCoreKeys: string[];
};

function collectExternalKeys(externalIds: ExternalIdRef[] | undefined): string[] {
  const keys: string[] = [];
  for (const ref of dedupeExternalIds(externalIds)) {
    const k = externalKey(ref);
    if (k) keys.push(k);
  }
  // Stable ordering for deterministic merges.
  keys.sort();
  return keys;
}

function mergeOverlayTagMaps(entries: OverlayStoreEntry[]): Record<string, OverlayTagValue> {
  if (entries.length === 0) return {};
  if (entries.length === 1) return entries[0].tags ?? {};

  // Deterministic precedence: sort by entryId, later wins.
  const sorted = [...entries].sort((a, b) => a.entryId.localeCompare(b.entryId));
  const out: Record<string, OverlayTagValue> = {};
  for (const e of sorted) {
    for (const [k, v] of Object.entries(e.tags ?? {})) out[k] = v;
  }
  return out;
}

function findMatchingOverlayEntries(
  store: OverlayStore,
  kind: 'element' | 'relationship',
  externalKeys: string[]
): OverlayStoreEntry[] {
  const ids = new Set<string>();
  for (const k of externalKeys) {
    for (const id of store.findEntryIdsByExternalKey(k)) ids.add(id);
  }
  const out: OverlayStoreEntry[] = [];
  for (const id of ids) {
    const e = store.getEntry(id);
    if (!e) continue;
    if (e.target.kind !== kind) continue;
    out.push(e);
  }
  return out;
}

export function getEffectiveTagsForElement(model: Model, el: Element, overlayStore: OverlayStore): EffectiveTagsResult {
  void model; // reserved for future policies / diagnostics

  const keys = collectExternalKeys(el.externalIds);
  const matches = findMatchingOverlayEntries(overlayStore, 'element', keys);
  const overlayTags = mergeOverlayTagMaps(matches);
  const { effective, overriddenCoreKeys } = mergeTaggedValuesWithOverlay(el.taggedValues, overlayTags);

  const overlayMatch: OverlayMatchInfo =
    matches.length === 0
      ? { kind: 'none' }
      : matches.length === 1
        ? { kind: 'single', entryId: matches[0].entryId }
        : { kind: 'multiple', entryIds: matches.map((m) => m.entryId).sort() };

  return { effectiveTaggedValues: effective, overlayTags, overlayMatch, overriddenCoreKeys };
}

export function getEffectiveTagsForRelationship(
  model: Model,
  rel: Relationship,
  overlayStore: OverlayStore
): EffectiveTagsResult {
  void model; // reserved for future policies / diagnostics

  const keys = collectExternalKeys(rel.externalIds);
  const matches = findMatchingOverlayEntries(overlayStore, 'relationship', keys);
  const overlayTags = mergeOverlayTagMaps(matches);
  const { effective, overriddenCoreKeys } = mergeTaggedValuesWithOverlay(rel.taggedValues, overlayTags);

  const overlayMatch: OverlayMatchInfo =
    matches.length === 0
      ? { kind: 'none' }
      : matches.length === 1
        ? { kind: 'single', entryId: matches[0].entryId }
        : { kind: 'multiple', entryIds: matches.map((m) => m.entryId).sort() };

  return { effectiveTaggedValues: effective, overlayTags, overlayMatch, overriddenCoreKeys };
}

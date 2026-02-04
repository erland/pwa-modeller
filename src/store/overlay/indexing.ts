import type { Model } from '../../domain/types';
import { externalKey } from '../../domain/externalIds';
import type { OverlayTagValue } from '../../domain/overlay';
import { toExternalIdRef } from '../../domain/overlay';
import {
  buildOverlayModelExternalIdIndex,
  type ModelIndex,
  type ModelTargetKind,
  type ModelTargetRef
} from '../../domain/overlay/modelIndex';

import type { OverlayStore, OverlayStoreEntry } from './OverlayStore';

export type OverlayAttachedTarget = {
  /** Model target id (element id or relationship id). */
  targetId: string;
  /** Overlay entries attached to this target (in deterministic order by entryId). */
  entryIds: string[];
  /** Merged overlay tags from attached entries (later entryId wins). */
  mergedTags: Record<string, OverlayTagValue>;
};

export type OverlayAttachmentIndex = {
  modelIndex: ModelIndex;
  elements: Map<string, OverlayAttachedTarget>;
  relationships: Map<string, OverlayAttachedTarget>;
  orphanEntryIds: string[];
};

function stableExternalKeysForEntry(entry: OverlayStoreEntry): string[] {
  const keys: string[] = [];
  for (const r of entry.target.externalRefs ?? []) {
    const k = externalKey(toExternalIdRef(r));
    if (k) keys.push(k);
  }
  keys.sort();
  return Array.from(new Set(keys));
}

function uniqueTargets(targets: ModelTargetRef[]): ModelTargetRef[] {
  const seen = new Set<string>();
  const out: ModelTargetRef[] = [];
  for (const t of targets) {
    const k = `${t.kind}:${t.id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
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

function attachToIndex(
  map: Map<string, OverlayStoreEntry[]>,
  targetId: string,
  entry: OverlayStoreEntry
): void {
  const list = map.get(targetId);
  if (!list) {
    map.set(targetId, [entry]);
    return;
  }
  if (list.some((e) => e.entryId === entry.entryId)) return;
  list.push(entry);
}

function resolveCandidates(
  modelIndex: ModelIndex,
  keys: string[],
  kind: ModelTargetKind
): ModelTargetRef[] {
  const candidates: ModelTargetRef[] = [];
  for (const k of keys) {
    const ts = modelIndex.get(k);
    if (!ts) continue;
    for (const t of ts) {
      if (t.kind !== kind) continue;
      candidates.push(t);
    }
  }
  return uniqueTargets(candidates);
}

/**
 * Build a fast lookup index for overlay entries against a specific model.
 *
 * This index is intended for analysis features (lineage, matrices, etc.) where we need
 * repeated access to overlay tags by model id without re-scanning all entries.
 */
export function buildOverlayAttachmentIndex(model: Model, overlayStore: OverlayStore): OverlayAttachmentIndex {
  const modelIndex = buildOverlayModelExternalIdIndex(model);

  const elementEntries = new Map<string, OverlayStoreEntry[]>();
  const relationshipEntries = new Map<string, OverlayStoreEntry[]>();
  const orphanEntryIds: string[] = [];

  for (const entry of overlayStore.listEntries()) {
    const keys = stableExternalKeysForEntry(entry);
    const kind = entry.target.kind;
    const candidates = resolveCandidates(modelIndex, keys, kind);

    if (candidates.length === 0) {
      orphanEntryIds.push(entry.entryId);
      continue;
    }

    for (const c of candidates) {
      if (c.kind === 'element') attachToIndex(elementEntries, c.id, entry);
      else attachToIndex(relationshipEntries, c.id, entry);
    }
  }

  const elements: Map<string, OverlayAttachedTarget> = new Map();
  for (const [targetId, entries] of elementEntries.entries()) {
    const sorted = [...entries].sort((a, b) => a.entryId.localeCompare(b.entryId));
    elements.set(targetId, {
      targetId,
      entryIds: sorted.map((e) => e.entryId),
      mergedTags: mergeOverlayTagMaps(sorted)
    });
  }

  const relationships: Map<string, OverlayAttachedTarget> = new Map();
  for (const [targetId, entries] of relationshipEntries.entries()) {
    const sorted = [...entries].sort((a, b) => a.entryId.localeCompare(b.entryId));
    relationships.set(targetId, {
      targetId,
      entryIds: sorted.map((e) => e.entryId),
      mergedTags: mergeOverlayTagMaps(sorted)
    });
  }

  orphanEntryIds.sort();

  return { modelIndex, elements, relationships, orphanEntryIds };
}

export function getOverlayTagsForElementId(
  index: OverlayAttachmentIndex,
  elementId: string
): Record<string, OverlayTagValue> {
  return index.elements.get(elementId)?.mergedTags ?? {};
}

export function getOverlayTagsForRelationshipId(
  index: OverlayAttachmentIndex,
  relationshipId: string
): Record<string, OverlayTagValue> {
  return index.relationships.get(relationshipId)?.mergedTags ?? {};
}

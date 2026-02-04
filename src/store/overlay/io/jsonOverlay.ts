import type { Model } from '../../../domain/types';
import { createId } from '../../../domain/id';
import {
  OVERLAY_FILE_FORMAT_V1,
  OVERLAY_SCHEMA_VERSION,
  computeModelSignature,
  isOverlayFile,
  normalizeOverlayRefs
} from '../../../domain/overlay';
import { migrateOverlayFileToCurrent } from '../../../domain/overlay';
import { buildOverlayModelExternalIdIndex } from '../../../domain/overlay';
import type { ModelIndex } from '../../../domain/overlay';
import type { OverlayEntry, OverlayFile, OverlayTargetKind } from '../../../domain/overlay';
import type { OverlayStore, OverlayStoreEntry, OverlayStoreUpsertInput } from '../OverlayStore';
import { resolveOverlayAgainstModel } from '../resolve';

export type OverlayImportWarning =
  | {
      type: 'signature-mismatch';
      fileSignature?: string;
      currentSignature?: string;
    }
  | {
      type: 'merge-conflict-multiple-existing';
      importedEntryIndex: number;
      importedEntryId?: string;
      kind: OverlayTargetKind;
      matchedEntryIds: string[];
    }
  | {
      type: 'dropped-invalid-entry';
      importedEntryIndex: number;
      reason: string;
    };

export type OverlayImportStats = {
  added: number;
  updated: number;
  replaced: number;
  droppedInvalid: number;
  conflictsCreatedNew: number;
};

export type OverlayImportResult = {
  file: OverlayFile;
  warnings: OverlayImportWarning[];
  stats: OverlayImportStats;
  resolveReport: ReturnType<typeof resolveOverlayAgainstModel>;
};

export type OverlayImportStrategy = 'merge' | 'replace';

export type OverlayImportOptions = {
  strategy?: OverlayImportStrategy;
  /**
   * If true (default), a signature mismatch produces a warning; import still proceeds.
   * If false, signature mismatches are ignored.
   */
  warnOnSignatureMismatch?: boolean;
};

function nowIso(): string {
  return new Date().toISOString();
}

function stableStringify(obj: unknown): string {
  return JSON.stringify(obj, null, 2);
}

function toOverlayEntry(e: OverlayStoreEntry): OverlayEntry {
  return {
    entryId: e.entryId,
    target: {
      kind: e.target.kind,
      externalRefs: normalizeOverlayRefs(e.target.externalRefs)
    },
    tags: e.tags,
    meta: e.meta
  };
}

function toStoreUpsertInput(entry: OverlayEntry): OverlayStoreUpsertInput | null {
  const kind = entry?.target?.kind;
  if (kind !== 'element' && kind !== 'relationship') return null;
  const refs = normalizeOverlayRefs(entry.target.externalRefs);
  if (refs.length === 0) return null;

  return {
    entryId: entry.entryId,
    kind,
    externalRefs: refs,
    tags: entry.tags ?? {},
    meta: entry.meta
  };
}

/** Serialize current overlay store to an `OverlayFile` object. */
export function serializeOverlayStoreToFile(args: {
  overlayStore: OverlayStore;
  model?: Model;
  modelName?: string;
  createdAt?: string;
}): OverlayFile {
  const createdAt = args.createdAt ?? nowIso();
  const signature = args.model ? computeModelSignature(args.model) : undefined;
  const name = args.modelName?.trim() ? args.modelName.trim() : args.model?.metadata?.name;

  const modelHint = name || signature ? { name, signature } : undefined;

  return {
    format: OVERLAY_FILE_FORMAT_V1,
    schemaVersion: OVERLAY_SCHEMA_VERSION,
    createdAt,
    modelHint,
    entries: args.overlayStore
      .listEntries()
      .map(toOverlayEntry)
      .sort((a, b) => (a.entryId ?? '').localeCompare(b.entryId ?? ''))
  };
}

/** Serialize to pretty JSON text (2-space indentation). */
export function serializeOverlayStoreToJson(args: {
  overlayStore: OverlayStore;
  model?: Model;
  modelName?: string;
  createdAt?: string;
}): string {
  return stableStringify(serializeOverlayStoreToFile(args));
}

/** Parse JSON text and validate it as an overlay file. Throws on invalid input. */
export function parseOverlayJson(text: string): OverlayFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'invalid json';
    throw new Error(`Overlay import failed: ${msg}`);
  }
  if (!isOverlayFile(raw)) {
    throw new Error('Overlay import failed: not a valid overlay file (format or structure mismatch)');
  }
  return migrateOverlayFileToCurrent(raw);
}

function buildModelIndexOrThrow(model: Model, provided?: ModelIndex): ModelIndex {
  return provided ?? buildOverlayModelExternalIdIndex(model);
}

function findMatchingExistingEntries(args: {
  overlayStore: OverlayStore;
  kind: OverlayTargetKind;
  refs: ReturnType<typeof normalizeOverlayRefs>;
}): string[] {
  const candidates = new Set<string>();
  const keys = args.refs.map((r) => `${r.scheme}||${r.value}`);
  for (const k of keys) {
    for (const id of args.overlayStore.findEntryIdsByExternalKey(k)) {
      candidates.add(id);
    }
  }

  const out: string[] = [];
  for (const id of candidates) {
    const e = args.overlayStore.getEntry(id);
    if (!e) continue;
    if (e.target.kind !== args.kind) continue;
    out.push(id);
  }
  out.sort();
  return out;
}

function ensureUniqueEntryId(store: OverlayStore, desired?: string): string {
  const d = desired?.trim();
  if (d && !store.getEntry(d)) return d;
  return createId('ovl');
}

function shallowMergeMeta(
  prev: OverlayStoreEntry['meta'],
  next: OverlayEntry['meta']
): OverlayStoreEntry['meta'] {
  if (!next) return prev;
  return { ...(prev ?? {}), ...(next ?? {}) };
}

/**
 * Import an overlay file into the in-memory overlay store.
 *
 * Strategies:
 * - `merge` (default): match imported entries to existing ones by overlapping external keys (same kind).
 *   Imported tag keys overwrite existing keys. External refs are unioned and normalized.
 * - `replace`: clears the store first, then adds all imported entries.
 */
export function importOverlayFileToStore(args: {
  overlayStore: OverlayStore;
  overlayFile: OverlayFile;
  model: Model;
  modelIndex?: ModelIndex;
  options?: OverlayImportOptions;
}): OverlayImportResult {
  const strategy: OverlayImportStrategy = args.options?.strategy ?? 'merge';
  const warnings: OverlayImportWarning[] = [];

  const currentSignature = computeModelSignature(args.model);
  const fileSignature = args.overlayFile.modelHint?.signature;
  const warnSig = args.options?.warnOnSignatureMismatch !== false;
  if (warnSig && fileSignature && fileSignature !== currentSignature) {
    warnings.push({
      type: 'signature-mismatch',
      fileSignature,
      currentSignature
    });
  }

  const stats: OverlayImportStats = {
    added: 0,
    updated: 0,
    replaced: 0,
    droppedInvalid: 0,
    conflictsCreatedNew: 0
  };

  if (strategy === 'replace') {
    args.overlayStore.clear();
    for (let i = 0; i < args.overlayFile.entries.length; i += 1) {
      const e = args.overlayFile.entries[i];
      const upsert = toStoreUpsertInput(e);
      if (!upsert) {
        stats.droppedInvalid += 1;
        warnings.push({ type: 'dropped-invalid-entry', importedEntryIndex: i, reason: 'missing kind/refs' });
        continue;
      }
      const entryId = ensureUniqueEntryId(args.overlayStore, upsert.entryId);
      args.overlayStore.upsertEntry({ ...upsert, entryId });
      stats.replaced += 1;
    }
  } else {
    for (let i = 0; i < args.overlayFile.entries.length; i += 1) {
      const imported = args.overlayFile.entries[i];
      const upsert = toStoreUpsertInput(imported);
      if (!upsert) {
        stats.droppedInvalid += 1;
        warnings.push({ type: 'dropped-invalid-entry', importedEntryIndex: i, reason: 'missing kind/refs' });
        continue;
      }

      const matches = findMatchingExistingEntries({
        overlayStore: args.overlayStore,
        kind: upsert.kind,
        refs: upsert.externalRefs
      });

      if (matches.length === 0) {
        const entryId = ensureUniqueEntryId(args.overlayStore, upsert.entryId);
        args.overlayStore.upsertEntry({ ...upsert, entryId });
        stats.added += 1;
        continue;
      }

      if (matches.length === 1) {
        const existingId = matches[0];
        const existing = args.overlayStore.getEntry(existingId);
        if (!existing) {
          const entryId = ensureUniqueEntryId(args.overlayStore, upsert.entryId);
          args.overlayStore.upsertEntry({ ...upsert, entryId });
          stats.added += 1;
          continue;
        }

        const mergedRefs = normalizeOverlayRefs([...existing.target.externalRefs, ...upsert.externalRefs]);
        const mergedTags = { ...existing.tags, ...(upsert.tags ?? {}) };
        const mergedMeta = shallowMergeMeta(existing.meta, upsert.meta);
        args.overlayStore.upsertEntry({
          entryId: existingId,
          kind: existing.target.kind,
          externalRefs: mergedRefs,
          tags: mergedTags,
          meta: mergedMeta
        });
        stats.updated += 1;
        continue;
      }

      // Multiple existing matches: avoid destructive overwrite.
      warnings.push({
        type: 'merge-conflict-multiple-existing',
        importedEntryIndex: i,
        importedEntryId: imported.entryId,
        kind: upsert.kind,
        matchedEntryIds: matches
      });
      const entryId = ensureUniqueEntryId(args.overlayStore, upsert.entryId);
      args.overlayStore.upsertEntry({ ...upsert, entryId });
      stats.conflictsCreatedNew += 1;
    }
  }

  const modelIndex = buildModelIndexOrThrow(args.model, args.modelIndex);
  const resolveReport = resolveOverlayAgainstModel(args.overlayStore.listEntries(), modelIndex);

  return {
    file: args.overlayFile,
    warnings,
    stats,
    resolveReport
  };
}

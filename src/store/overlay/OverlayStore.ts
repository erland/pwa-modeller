import { externalKey } from '../../domain/externalIds';
import { createId } from '../../domain/id';
import type {
  OverlayEntryMeta,
  OverlayExternalRefSet,
  OverlayTagValue,
  OverlayTarget,
  OverlayTargetKind
} from '../../domain/overlay';
import { normalizeOverlayRefs, toExternalIdRef } from '../../domain/overlay';

export type OverlayStoreEntry = {
  entryId: string;
  target: OverlayTarget;
  tags: Record<string, OverlayTagValue>;
  meta?: OverlayEntryMeta;
};

export type OverlayStoreUpsertInput = {
  entryId?: string;
  kind: OverlayTargetKind;
  externalRefs: OverlayExternalRefSet;
  tags?: Record<string, OverlayTagValue>;
  meta?: OverlayEntryMeta;
};

export type OverlayRefIndex = Map<string /* externalKey */, Set<string /* entryId */>>;

type Listener = () => void;

function stableKeysForRefs(refs: OverlayExternalRefSet): string[] {
  const out: string[] = [];
  for (const r of refs) {
    const k = externalKey(toExternalIdRef(r));
    if (k) out.push(k);
  }
  out.sort();
  return out;
}

/**
 * In-memory overlay store.
 *
 * - Keeps entries keyed by `entryId`
 * - Maintains a `refIndex` mapping externalKey -> entryIds for quick lookup
 *
 * Persistence + IO are intentionally handled in later steps.
 */
export class OverlayStore {
  private entries = new Map<string, OverlayStoreEntry>();
  private entryKeys = new Map<string, string[]>();
  private refIndex: OverlayRefIndex = new Map();

  private version = 0;

  private listeners = new Set<Listener>();

  get size(): number {
    return this.entries.size;
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Monotonic counter incremented for every change; useful for React subscription snapshots. */
  getVersion(): number {
    return this.version;
  }

  private emit = (): void => {
    this.version++;
    for (const l of this.listeners) l();
  };

  listEntries(): OverlayStoreEntry[] {
    return [...this.entries.values()];
  }

  getEntry(entryId: string): OverlayStoreEntry | undefined {
    return this.entries.get(entryId);
  }

  /** ExternalKey -> entryId set */
  getRefIndex(): OverlayRefIndex {
    return this.refIndex;
  }

  findEntryIdsByExternalKey(key: string): string[] {
    const set = this.refIndex.get(key);
    return set ? [...set] : [];
  }

  upsertEntry(input: OverlayStoreUpsertInput): string {
    const entryId = input.entryId?.trim() ? input.entryId.trim() : createId('ovl');

    const normalizedRefs = normalizeOverlayRefs(input.externalRefs);
    const nextTarget: OverlayTarget = { kind: input.kind, externalRefs: normalizedRefs };

    const prev = this.entries.get(entryId);
    const next: OverlayStoreEntry = {
      entryId,
      target: nextTarget,
      tags: input.tags ?? prev?.tags ?? {},
      meta: input.meta ?? prev?.meta
    };

    this.entries.set(entryId, next);
    this.reindexEntry(entryId, nextTarget.externalRefs);
    this.emit();
    return entryId;
  }

  setTag(entryId: string, key: string, value: OverlayTagValue): void {
    const e = this.entries.get(entryId);
    if (!e) return;
    const k = key.trim();
    if (!k) return;
    this.entries.set(entryId, { ...e, tags: { ...e.tags, [k]: value } });
    this.emit();
  }

  /** Replace all tags for an entry at once (used by UI editors and import flows). */
  setTags(entryId: string, tags: Record<string, OverlayTagValue>): void {
    const e = this.entries.get(entryId);
    if (!e) return;
    const next: Record<string, OverlayTagValue> = {};
    for (const [k0, v] of Object.entries(tags ?? {})) {
      const k = (k0 ?? '').toString().trim();
      if (!k) continue;
      next[k] = v;
    }
    this.entries.set(entryId, { ...e, tags: next });
    this.emit();
  }

  removeTag(entryId: string, key: string): void {
    const e = this.entries.get(entryId);
    if (!e) return;
    const k = key.trim();
    if (!k) return;
    if (!(k in e.tags)) return;
    const nextTags = { ...e.tags };
    delete nextTags[k];
    this.entries.set(entryId, { ...e, tags: nextTags });
    this.emit();
  }

  deleteEntry(entryId: string): void {
    if (!this.entries.has(entryId)) return;
    this.entries.delete(entryId);
    this.removeEntryFromIndex(entryId);
    this.emit();
  }

  clear(): void {
    this.entries.clear();
    this.entryKeys.clear();
    this.refIndex.clear();
    this.emit();
  }

  /** Replace all entries at once (used by persistence/hydration). */
  hydrate(entries: OverlayStoreEntry[]): void {
    this.entries.clear();
    this.entryKeys.clear();
    this.refIndex.clear();

    for (const e of entries) {
      if (!e?.entryId) continue;
      this.entries.set(e.entryId, e);
      this.reindexEntry(e.entryId, e.target.externalRefs);
    }
    this.emit();
  }

  private reindexEntry(entryId: string, refs: OverlayExternalRefSet): void {
    this.removeEntryFromIndex(entryId);
    const keys = stableKeysForRefs(refs);
    this.entryKeys.set(entryId, keys);
    for (const k of keys) {
      let set = this.refIndex.get(k);
      if (!set) {
        set = new Set();
        this.refIndex.set(k, set);
      }
      set.add(entryId);
    }
  }

  private removeEntryFromIndex(entryId: string): void {
    const prevKeys = this.entryKeys.get(entryId);
    if (!prevKeys) return;
    for (const k of prevKeys) {
      const set = this.refIndex.get(k);
      if (!set) continue;
      set.delete(entryId);
      if (set.size === 0) this.refIndex.delete(k);
    }
    this.entryKeys.delete(entryId);
  }
}

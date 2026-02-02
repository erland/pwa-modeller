import type { ModelIndex, ModelTargetRef } from '../../domain/overlay';
import { externalKey } from '../../domain/externalIds';
import { toExternalIdRef } from '../../domain/overlay';
import type { OverlayStoreEntry } from './OverlayStore';

export type ResolveAttached = {
  entryId: string;
  target: ModelTargetRef;
  viaExternalKeys: string[];
};

export type ResolveOrphan = {
  entryId: string;
  externalKeys: string[];
};

export type ResolveAmbiguous = {
  entryId: string;
  candidates: ModelTargetRef[];
  viaExternalKeys: string[];
};

export type ResolveReport = {
  total: number;
  attached: ResolveAttached[];
  orphan: ResolveOrphan[];
  ambiguous: ResolveAmbiguous[];
  counts: {
    attached: number;
    orphan: number;
    ambiguous: number;
  };
};

function externalKeysForEntry(entry: OverlayStoreEntry): string[] {
  const set = new Set<string>();
  for (const r of entry.target.externalRefs) {
    const k = externalKey(toExternalIdRef(r));
    if (k) set.add(k);
  }
  return [...set].sort();
}

function uniqueTargets(targets: ModelTargetRef[]): ModelTargetRef[] {
  const seen = new Set<string>();
  const out: ModelTargetRef[] = [];
  for (const t of targets) {
    const key = `${t.kind}:${t.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/**
 * Resolve overlay entries against a model index.
 *
 * Matching behavior:
 * - any external ref in the entry's ref-set can attach the entry
 * - candidates are filtered by target kind
 * - 0 candidates => orphan
 * - 1 candidate  => attached
 * - >1 candidates => ambiguous
 */
export function resolveOverlayAgainstModel(entries: Iterable<OverlayStoreEntry>, modelIndex: ModelIndex): ResolveReport {
  const attached: ResolveAttached[] = [];
  const orphan: ResolveOrphan[] = [];
  const ambiguous: ResolveAmbiguous[] = [];

  let total = 0;
  for (const entry of entries) {
    total += 1;
    const keys = externalKeysForEntry(entry);
    const candidates: ModelTargetRef[] = [];
    for (const k of keys) {
      const ts = modelIndex.get(k);
      if (!ts) continue;
      for (const t of ts) {
        if (t.kind !== entry.target.kind) continue;
        candidates.push(t);
      }
    }

    const uniq = uniqueTargets(candidates);
    if (uniq.length === 0) {
      orphan.push({ entryId: entry.entryId, externalKeys: keys });
      continue;
    }
    if (uniq.length === 1) {
      attached.push({ entryId: entry.entryId, target: uniq[0], viaExternalKeys: keys });
      continue;
    }
    ambiguous.push({ entryId: entry.entryId, candidates: uniq, viaExternalKeys: keys });
  }

  return {
    total,
    attached,
    orphan,
    ambiguous,
    counts: {
      attached: attached.length,
      orphan: orphan.length,
      ambiguous: ambiguous.length
    }
  };
}

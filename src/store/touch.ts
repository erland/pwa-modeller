import type { TouchedIds } from './changeSet';

function uniqNonEmpty(ids: readonly (string | null | undefined)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function makeTouched(key: keyof TouchedIds, ids: string[]): TouchedIds {
  if (!ids.length) return {};
  return { [key]: ids } as TouchedIds;
}

/**
 * Helpers to build TouchedIds consistently across ops/mutations.
 *
 * Note: Determinism (sorting/dedup) is enforced by ChangeSetRecorder.flush().
 * These helpers focus on ergonomics and avoiding ad-hoc object literals.
 */
export const touch = {
  elementUpserts: (...ids: string[]) => makeTouched('elementUpserts', uniqNonEmpty(ids)),
  elementDeletes: (...ids: string[]) => makeTouched('elementDeletes', uniqNonEmpty(ids)),

  relationshipUpserts: (...ids: string[]) => makeTouched('relationshipUpserts', uniqNonEmpty(ids)),
  relationshipDeletes: (...ids: string[]) => makeTouched('relationshipDeletes', uniqNonEmpty(ids)),

  viewUpserts: (...ids: string[]) => makeTouched('viewUpserts', uniqNonEmpty(ids)),
  viewDeletes: (...ids: string[]) => makeTouched('viewDeletes', uniqNonEmpty(ids)),

  folderUpserts: (...ids: string[]) => makeTouched('folderUpserts', uniqNonEmpty(ids)),
  folderDeletes: (...ids: string[]) => makeTouched('folderDeletes', uniqNonEmpty(ids)),

  modelMetadataChanged: () => ({ modelMetadataChanged: true } as TouchedIds),

  combine: (...parts: TouchedIds[]): TouchedIds => {
    const out: TouchedIds = {};
    for (const p of parts) {
      if (!p) continue;
      if (p.modelMetadataChanged) out.modelMetadataChanged = true;

      for (const k of ['elementUpserts','elementDeletes','relationshipUpserts','relationshipDeletes','viewUpserts','viewDeletes','folderUpserts','folderDeletes'] as const) {
        const arr = p[k];
        if (!arr || !arr.length) continue;
        const existing = out[k] ?? [];
        out[k] = existing.concat(arr);
      }
    }
    // drop empty arrays (keep it clean)
    for (const k of ['elementUpserts','elementDeletes','relationshipUpserts','relationshipDeletes','viewUpserts','viewDeletes','folderUpserts','folderDeletes'] as const) {
      if (out[k] && out[k]!.length === 0) delete out[k];
    }
    return out;
  },
};

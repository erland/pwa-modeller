import { useEffect, useMemo, useState } from 'react';

import type { ExternalIdRef, TaggedValue } from '../../../../domain';
import { dedupeExternalIds, externalKey } from '../../../../domain/externalIds';
import { Dialog } from '../../../dialog/Dialog';
import { TaggedValuesEditor } from '../TaggedValuesEditor';
import type { OverlayStore, OverlayStoreEntry } from '../../../../store/overlay';
import { overlayStore, useOverlayStore } from '../../../../store/overlay';
import { normalizeOverlayRefs, toOverlayExternalRef, overlayTagsToTaggedValues, taggedValuesToOverlayTags } from '../../../../domain/overlay';

type Props = {
  kind: 'element' | 'relationship';
  displayName: string;
  externalIds?: ExternalIdRef[];
};

type MatchInfo = {
  entryIds: string[];
  entries: OverlayStoreEntry[];
};

function buildMatchInfo(store: OverlayStore, kind: 'element' | 'relationship', ids: ExternalIdRef[]): MatchInfo {
  const keys = ids.map((r) => externalKey(r)).filter(Boolean);

  const found = new Set<string>();
  for (const k of keys) {
    for (const entryId of store.findEntryIdsByExternalKey(k)) {
      found.add(entryId);
    }
  }

  const entryIds = [...found.values()].sort();
  const entries: OverlayStoreEntry[] = [];
  for (const entryId of entryIds) {
    const e = store.getEntry(entryId);
    if (!e) continue;
    if (e.target.kind !== kind) continue;
    entries.push(e);
  }

  return { entryIds, entries };
}

function describeEntry(e: OverlayStoreEntry): string {
  const firstRef = e.target.externalRefs[0];
  const hint = firstRef ? `${firstRef.scheme}:${firstRef.value}` : e.entryId;
  return `${e.entryId} (${hint})`;
}

export function OverlayTagsSection({ kind, displayName, externalIds }: Props) {
  const dedupedExternalIds = useMemo(() => dedupeExternalIds(externalIds), [externalIds]);

  // Use a stable cache key derived from the current target refs so the snapshot
  // recomputes when the selection changes, even if the overlay store doesn't.
  const cacheKey = useMemo(() => {
    const keys = dedupedExternalIds
      .map((r) => externalKey(r))
      .filter(Boolean)
      .sort();
    return `${kind}|${keys.join(',')}`;
  }, [dedupedExternalIds, kind]);

  // Subscribe so this component re-renders when overlay changes.
  const match = useOverlayStore((s) => buildMatchInfo(s, kind, dedupedExternalIds), cacheKey);

  const hasExternalIds = useMemo(() => dedupedExternalIds.length > 0, [dedupedExternalIds]);

  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<TaggedValue[] | undefined>(undefined);

  useEffect(() => {
    // Keep selection stable across updates; if current selection disappears, fall back to first.
    if (activeEntryId && match.entries.some((e) => e.entryId === activeEntryId)) return;
    setActiveEntryId(match.entries[0]?.entryId ?? null);
  }, [activeEntryId, match.entries]);

  const activeEntry = useMemo(() => {
    if (!activeEntryId) return undefined;
    return match.entries.find((e) => e.entryId === activeEntryId);
  }, [match.entries, activeEntryId]);

  const overlayTaggedValues = useMemo(() => {
    return overlayTagsToTaggedValues(activeEntry?.tags);
  }, [activeEntry]);

  useEffect(() => {
    if (!isOpen) return;
    setDraft(overlayTaggedValues);
  }, [isOpen, overlayTaggedValues]);

  const matchLabel = useMemo(() => {
    if (!hasExternalIds) return 'unavailable';
    if (match.entries.length === 0) return 'none';
    if (match.entries.length === 1) return 'attached';
    return 'multiple';
  }, [match.entries.length, hasExternalIds]);

  const createEntryFromTarget = (): string | null => {
    if (!dedupedExternalIds.length) return null;
    const refs = normalizeOverlayRefs(dedupedExternalIds.map((r) => toOverlayExternalRef(r)));
    if (!refs.length) return null;
    const entryId = overlayStore.upsertEntry({ kind, externalRefs: refs, tags: {} });
    return entryId;
  };

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <p className="panelHint" style={{ margin: 0 }}>
          Overlay tags
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {match.entries.length > 1 ? (
            <select
              className="selectInput"
              aria-label="Select overlay entry"
              value={activeEntryId ?? ''}
              onChange={(e) => setActiveEntryId(e.target.value || null)}
              style={{ maxWidth: 260 }}
            >
              {match.entries.map((e) => (
                <option key={e.entryId} value={e.entryId}>
                  {describeEntry(e)}
                </option>
              ))}
            </select>
          ) : null}

          <button
            type="button"
            className="miniButton"
            onClick={() => {
              if (!hasExternalIds) return;

              let entryId = activeEntryId;
              if (!entryId) {
                entryId = createEntryFromTarget();
                if (entryId) setActiveEntryId(entryId);
              }

              if (!entryId) return;
              setIsOpen(true);
            }}
            disabled={!hasExternalIds}
          >
            {match.entries.length ? (overlayTaggedValues.length ? 'Edit…' : 'Add…') : 'Create…'}
          </button>
        </div>
      </div>

      {!hasExternalIds ? (
        <p className="hintText" style={{ marginTop: 8 }}>
          No external ids on this {kind}. Overlay tags require external ids to attach.
        </p>
      ) : matchLabel === 'none' ? (
        <p className="hintText" style={{ marginTop: 8 }}>
          No overlay entry attached to this {kind} yet. Click Create… to add one using the current external ids.
        </p>
      ) : matchLabel === 'multiple' ? (
        <p className="hintText" style={{ marginTop: 8 }}>
          Multiple overlay entries match this {kind}. Select an entry above to edit.
        </p>
      ) : overlayTaggedValues.length === 0 ? (
        <p className="hintText" style={{ marginTop: 8 }}>
          None
        </p>
      ) : (
        <div className="propertiesGrid" style={{ marginTop: 8 }}>
          {overlayTaggedValues.slice(0, 4).map((tv) => (
            <div key={tv.id} className="propertiesRow">
              <div className="propertiesKey">{tv.key || '(empty key)'}</div>
              <div className="propertiesValue" style={{ fontWeight: 400 }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tv.value ?? ''}>
                  {(tv.value ?? '').toString()}
                </div>
              </div>
            </div>
          ))}
          {overlayTaggedValues.length > 4 ? (
            <div className="propertiesRow">
              <div className="propertiesKey" />
              <div className="propertiesValue" style={{ fontWeight: 400, opacity: 0.75 }}>
                …and {overlayTaggedValues.length - 4} more
              </div>
            </div>
          ) : null}
        </div>
      )}

      <Dialog
        title={`Overlay tags — ${displayName}`}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="shellButton" onClick={() => setIsOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="shellButton"
              onClick={() => {
                const entryId = activeEntryId;
                if (!entryId) {
                  setIsOpen(false);
                  return;
                }
                overlayStore.setTags(entryId, taggedValuesToOverlayTags(draft));
                setIsOpen(false);
              }}
            >
              Apply
            </button>
          </div>
        }
      >
        <div style={{ marginBottom: 10, fontSize: 12, opacity: 0.8 }}>
          Overlay tags override core tagged values with the same key.
        </div>
        <TaggedValuesEditor taggedValues={draft} onChange={setDraft} allowNamespaces={false} />
      </Dialog>
    </div>
  );
}

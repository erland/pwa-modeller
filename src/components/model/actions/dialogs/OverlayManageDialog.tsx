import { useMemo, useState } from 'react';

import type { Model, Element, Relationship } from '../../../../domain';
import { Dialog } from '../../../dialog/Dialog';
import { buildOverlayModelExternalIdIndex, type ModelTargetRef } from '../../../../domain/overlay';
import { resolveOverlayAgainstModel } from '../../../../store/overlay/resolve';
import { overlayStore, rebindOverlayEntryToTarget, useOverlayStore } from '../../../../store/overlay';

type ToastKind = 'info' | 'success' | 'warn' | 'error';

type OverlayManageDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  model: Model;
  onToast: (t: { kind: ToastKind; message: string }) => void;
};

type TabId = 'orphans' | 'ambiguous';

function getElementTitle(el: Element): string {
  return el.name || '(unnamed element)';
}

function getRelationshipTitle(rel: Relationship): string {
  return (rel.name ?? '').trim() || String(rel.type || 'Relationship');
}

function targetSummary(model: Model, t: ModelTargetRef): { title: string; subtitle: string; hasExternalIds: boolean } {
  if (t.kind === 'element') {
    const el = model.elements?.[t.id];
    const title = el ? getElementTitle(el) : `Element ${t.id}`;
    const subtitle = el ? `${el.type} · ${t.id}` : t.id;
    const hasExternalIds = !!(el?.externalIds && el.externalIds.length);
    return { title, subtitle, hasExternalIds };
  }
  const rel = model.relationships?.[t.id];
  const title = rel ? getRelationshipTitle(rel) : `Relationship ${t.id}`;
  const src = rel?.sourceElementId ? model.elements?.[rel.sourceElementId]?.name ?? rel.sourceElementId : '';
  const dst = rel?.targetElementId ? model.elements?.[rel.targetElementId]?.name ?? rel.targetElementId : '';
  const subtitleParts = [String(rel?.type ?? 'Relationship'), t.id];
  if (src || dst) subtitleParts.push(`${src} → ${dst}`);
  const subtitle = subtitleParts.join(' · ');
  const hasExternalIds = !!(rel?.externalIds && rel.externalIds.length);
  return { title, subtitle, hasExternalIds };
}

function matchesQuery(text: string, q: string): boolean {
  const qt = q.trim().toLowerCase();
  if (!qt) return true;
  return text.toLowerCase().includes(qt);
}

function buildSearchIndex(model: Model): Array<{ kind: 'element' | 'relationship'; id: string; title: string; subtitle: string }> {
  const out: Array<{ kind: 'element' | 'relationship'; id: string; title: string; subtitle: string }> = [];
  for (const id of Object.keys(model.elements ?? {}).sort()) {
    const el = model.elements[id];
    if (!el) continue;
    out.push({ kind: 'element', id, title: getElementTitle(el), subtitle: `${el.type} · ${id}` });
  }
  for (const id of Object.keys(model.relationships ?? {}).sort()) {
    const rel = model.relationships[id];
    if (!rel) continue;
    const src = rel.sourceElementId ? model.elements?.[rel.sourceElementId]?.name ?? rel.sourceElementId : '';
    const dst = rel.targetElementId ? model.elements?.[rel.targetElementId]?.name ?? rel.targetElementId : '';
    const subtitleParts = [String(rel.type ?? 'Relationship'), id];
    if (src || dst) subtitleParts.push(`${src} → ${dst}`);
    out.push({ kind: 'relationship', id, title: getRelationshipTitle(rel), subtitle: subtitleParts.join(' · ') });
  }
  return out;
}

export function OverlayManageDialog({ isOpen, onClose, model, onToast }: OverlayManageDialogProps) {
  // Trigger rerender when the overlay store changes.
  const overlayVersion = useOverlayStore((s) => s.getVersion());

  const entries = useMemo(() => {
    // overlayStore reference is stable; overlayVersion is the change signal.
    void overlayVersion;
    return overlayStore.listEntries();
  }, [overlayVersion]);
  const modelIndex = useMemo(() => buildOverlayModelExternalIdIndex(model), [model]);
  const report = useMemo(() => resolveOverlayAgainstModel(entries, modelIndex), [entries, modelIndex]);

  const [tab, setTab] = useState<TabId>('orphans');
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedTarget, setSelectedTarget] = useState<ModelTargetRef | null>(null);
  const [replaceRefs, setReplaceRefs] = useState(true);
  const [preferUniqueRefs, setPreferUniqueRefs] = useState(true);

  const orphanIds = report.orphan.map((o) => o.entryId);
  const ambiguousIds = report.ambiguous.map((a) => a.entryId);

  const listIds = tab === 'orphans' ? orphanIds : ambiguousIds;
  const selectedId = selectedEntryId && listIds.includes(selectedEntryId) ? selectedEntryId : listIds[0] ?? null;

  const selectedEntry = selectedId ? overlayStore.getEntry(selectedId) : undefined;
  const selectedAmbiguous = selectedId ? report.ambiguous.find((a) => a.entryId === selectedId) : undefined;

  const searchIndex = useMemo(() => buildSearchIndex(model), [model]);
  const kindFilter = (selectedEntry?.target.kind ?? 'element') as 'element' | 'relationship';
  const results = useMemo(() => {
    const filtered = searchIndex.filter((x) => x.kind === kindFilter);
    const q = query.trim();
    const res = q
      ? filtered.filter((x) => matchesQuery(`${x.title} ${x.subtitle} ${x.id}`, q))
      : filtered;
    return res.slice(0, 25);
  }, [searchIndex, kindFilter, query]);

  const doDelete = (entryId: string) => {
    overlayStore.deleteEntry(entryId);
    onToast({ kind: 'info', message: `Overlay entry ${entryId} deleted.` });
    setSelectedTarget(null);
  };

  const doRebind = (entryId: string, target: ModelTargetRef) => {
    const res = rebindOverlayEntryToTarget(overlayStore, model, entryId, target, { replaceRefs, preferUniqueRefs });
    if (!res.ok) {
      const msg =
        res.reason === 'entry-not-found'
          ? 'Entry not found.'
          : res.reason === 'target-not-found'
            ? 'Target not found.'
            : 'Target has no external ids, cannot attach overlay.';
      onToast({ kind: 'error', message: msg });
      return;
    }
    const mode = res.usedUniqueRefs ? 'unique refs' : 'refs';
    onToast({ kind: 'success', message: `Rebound ${entryId} using ${mode} (${res.refCount} ref${res.refCount === 1 ? '' : 's'}).` });
    setSelectedTarget(null);
  };

  const selectedTargetInfo = selectedTarget ? targetSummary(model, selectedTarget) : null;

  return (
    <Dialog
      title="Manage overlay"
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="shellButton" onClick={onClose}>
            Close
          </button>
        </div>
      }
    >
      <div className="shellStatus" style={{ flexWrap: 'wrap' }}>
        <span className="shellStatusChip">Entries {entries.length}</span>
        <span className="shellStatusChip">Attached {report.counts.attached}</span>
        <span className="shellStatusChip">Orphan {report.counts.orphan}</span>
        <span className="shellStatusChip">Ambiguous {report.counts.ambiguous}</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button
          type="button"
          className={tab === 'orphans' ? 'shellButton shellPrimaryAction' : 'shellButton'}
          onClick={() => {
            setTab('orphans');
            setSelectedEntryId(null);
            setSelectedTarget(null);
          }}
        >
          Orphans ({report.counts.orphan})
        </button>
        <button
          type="button"
          className={tab === 'ambiguous' ? 'shellButton shellPrimaryAction' : 'shellButton'}
          onClick={() => {
            setTab('ambiguous');
            setSelectedEntryId(null);
            setSelectedTarget(null);
          }}
        >
          Ambiguous ({report.counts.ambiguous})
        </button>
      </div>

      {listIds.length === 0 ? (
        <p className="hintText" style={{ marginTop: 12 }}>
          No {tab} entries.
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 12, marginTop: 12 }}>
          <div style={{ borderRight: '1px solid var(--shell-border)', paddingRight: 12, maxHeight: 460, overflow: 'auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {listIds.map((id) => {
                const e = overlayStore.getEntry(id);
                const active = id === selectedId;
                return (
                  <button
                    key={id}
                    type="button"
                    className={active ? 'crudCard crudCardActive' : 'crudCard'}
                    style={{ textAlign: 'left' }}
                    onClick={() => {
                      setSelectedEntryId(id);
                      setSelectedTarget(null);
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>Entry {id}</div>
                    <div className="hintText">
                      Kind: {e?.target.kind ?? '(unknown)'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ minWidth: 0 }}>
            {selectedEntry ? (
              <>
                <div className="crudCard">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>Entry {selectedEntry.entryId}</div>
                      <div className="hintText">Kind: {selectedEntry.target.kind}</div>
                    </div>
                    <button type="button" className="shellButton" onClick={() => doDelete(selectedEntry.entryId)}>
                      Delete
                    </button>
                  </div>
                  <div className="hintText" style={{ marginTop: 6 }}>
                    Refs: {selectedEntry.target.externalRefs.map((r) => `${r.scheme}:${r.value}`).join(', ') || '(none)'}
                  </div>
                </div>

                {tab === 'ambiguous' && selectedAmbiguous ? (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Candidates</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {selectedAmbiguous.candidates.map((c) => {
                        const info = targetSummary(model, c);
                        return (
                          <div key={`${c.kind}:${c.id}`} className="crudCard">
                            <div style={{ fontWeight: 700 }}>{info.title}</div>
                            <div className="hintText">{info.subtitle}</div>
                            <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                              <button
                                type="button"
                                className="shellButton"
                                disabled={!info.hasExternalIds}
                                title={!info.hasExternalIds ? 'Target has no external ids' : undefined}
                                onClick={() => doRebind(selectedEntry.entryId, c)}
                              >
                                Rebind to this
                              </button>
                              <button type="button" className="shellButton" onClick={() => setSelectedTarget(c)}>
                                Select
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Rebind</div>

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <label className="hintText" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="checkbox" checked={replaceRefs} onChange={(e) => setReplaceRefs(e.currentTarget.checked)} />
                      Replace refs
                    </label>
                    <label className="hintText" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={preferUniqueRefs}
                        onChange={(e) => setPreferUniqueRefs(e.currentTarget.checked)}
                      />
                      Prefer unique refs
                    </label>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.currentTarget.value)}
                      placeholder={`Search ${kindFilter}s by name, type, id…`}
                      className="textInput"
                      style={{ width: '100%' }}
                    />
                    <div className="hintText" style={{ marginTop: 6 }}>
                      Showing up to 25 results.
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10, maxHeight: 220, overflow: 'auto' }}>
                    {results.map((r) => {
                      const t: ModelTargetRef = { kind: r.kind, id: r.id };
                      const info = targetSummary(model, t);
                      const active = selectedTarget?.kind === t.kind && selectedTarget?.id === t.id;
                      return (
                        <button
                          key={`${r.kind}:${r.id}`}
                          type="button"
                          className={active ? 'crudCard crudCardActive' : 'crudCard'}
                          style={{ textAlign: 'left' }}
                          onClick={() => setSelectedTarget(t)}
                        >
                          <div style={{ fontWeight: 700 }}>{info.title}</div>
                          <div className="hintText">{info.subtitle}</div>
                        </button>
                      );
                    })}
                  </div>

                  <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <div className="hintText" style={{ minWidth: 0 }}>
                      {selectedTargetInfo ? (
                        <>
                          Selected: <strong>{selectedTargetInfo.title}</strong> ({selectedTargetInfo.subtitle})
                        </>
                      ) : (
                        'Select a target to rebind.'
                      )}
                    </div>
                    <button
                      type="button"
                      className="shellButton shellPrimaryAction"
                      disabled={!selectedTarget || !selectedTargetInfo?.hasExternalIds}
                      title={!selectedTarget ? 'Pick a target' : !selectedTargetInfo?.hasExternalIds ? 'Target has no external ids' : undefined}
                      onClick={() => {
                        if (!selectedTarget) return;
                        doRebind(selectedEntry.entryId, selectedTarget);
                      }}
                    >
                      Apply rebind
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <p className="hintText">No entry selected.</p>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}

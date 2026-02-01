import type { Dispatch, SetStateAction } from 'react';
import { useMemo } from 'react';

import type { Model } from '../../../../domain';

import { SandboxInsertElementList } from './SandboxInsertElementList';
import type { Candidate, PreviewState } from './types';
import { normalizeText } from './utils';

function matchesCandidate(args: { c: Candidate; q: string }): boolean {
  const q = normalizeText(args.q);
  if (!q) return true;
  const c = args.c;
  const hay = `${c.name} ${c.type} ${c.id}`.toLowerCase();
  return hay.includes(q);
}

type Props = {
  model: Model;
  error: string | null;
  preview: PreviewState | null;
  search: string;
  setSearch: Dispatch<SetStateAction<string>>;
  existingSet: Set<string>;
  selectedIds: Set<string>;
  toggleSelectedId: (id: string) => void;
  visibleCandidateIds: Set<string>;
  candidateById: Map<string, Candidate>;
  candidatesCount: number;
  selectedCount: number;
  selectedVisibleCount: number;
  selectedNewCount: number;
  maxNewNodes: number | null;
  selectAllVisible: () => void;
  clearVisible: () => void;
  selectNone: () => void;
};

export function SandboxInsertPreviewPanel(props: Props) {
  const {
    model,
    error,
    preview,
    search,
    setSearch,
    existingSet,
    selectedIds,
    toggleSelectedId,
    visibleCandidateIds,
    candidateById,
    candidatesCount,
    selectedCount,
    selectedVisibleCount,
    selectedNewCount,
    maxNewNodes,
    selectAllVisible,
    clearVisible,
    selectNone,
  } = props;

  const visibleCount = visibleCandidateIds.size;

  const overCap = maxNewNodes !== null && selectedNewCount > maxNewNodes;

  const header = useMemo(() => {
    if (!preview) return null;
    return (
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          background: 'var(--panel)',
          padding: '8px 0',
          borderBottom: '1px solid var(--border)',
          marginBottom: 8,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <p className="crudHint" style={{ margin: 0 }}>
            Candidates: {candidatesCount} (visible {visibleCount}) · Selected: {selectedCount} (visible {selectedVisibleCount})
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="miniLinkButton" onClick={selectAllVisible}>
              Select all visible
            </button>
            <button type="button" className="miniLinkButton" onClick={clearVisible}>
              Clear visible
            </button>
            <button type="button" className="miniLinkButton" onClick={selectNone}>
              Select none
            </button>
          </div>
        </div>
        {overCap ? (
          <p className="crudHint" style={{ margin: 0, marginTop: 6 }}>
            Selection exceeds node cap: will add up to {maxNewNodes} new node(s).
          </p>
        ) : null}
      </div>
    );
  }, [candidatesCount, clearVisible, maxNewNodes, overCap, preview, selectAllVisible, selectNone, selectedCount, selectedVisibleCount, visibleCount]);

  return (
    <div style={{ marginTop: 12 }}>
      {error ? <p className="crudHint">{error}</p> : null}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
        <input
          className="textInput"
          style={{ maxWidth: 320 }}
          value={search}
          placeholder="Search candidates…"
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <span className="crudHint" style={{ margin: 0 }}>
          Preview updates automatically
        </span>
      </div>

      {preview ? (
        <>
          {header}

          {preview.kind === 'intermediates' ? (
            <div style={{ marginTop: 8, maxHeight: 420, overflow: 'auto', paddingRight: 6 }}>
              {preview.paths.map((p, idx) => {
                const visibleIntermediates = p.intermediates.filter((id) => {
                  const c = candidateById.get(id);
                  if (!c) return false;
                  return matchesCandidate({ c, q: search });
                });

                const totalNew = p.intermediates.filter((id) => !existingSet.has(id)).length;
                const visibleNew = visibleIntermediates.filter((id) => !existingSet.has(id)).length;

                return (
                  <details
                    key={idx}
                    open
                    style={{
                      marginBottom: 10,
                      padding: 8,
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                    }}
                  >
                    <summary style={{ cursor: 'pointer' }}>
                      <span className="crudHint" style={{ margin: 0 }}>
                        Path {idx + 1}: {p.path.length} node(s) · intermediates {p.intermediates.length} (new {totalNew}, visible new {visibleNew})
                      </span>
                    </summary>

                    {visibleIntermediates.length ? (
                      <div style={{ marginTop: 8 }}>
                        <SandboxInsertElementList
                          model={model}
                          elementIds={visibleIntermediates}
                          existingSet={existingSet}
                          selectedIds={selectedIds}
                          onToggleId={toggleSelectedId}
                          disableExisting={false}
                        />
                      </div>
                    ) : (
                      <p className="crudHint" style={{ margin: 0, marginTop: 8 }}>
                        No intermediate candidates match the current filters.
                      </p>
                    )}
                  </details>
                );
              })}
            </div>
          ) : (
            <div style={{ marginTop: 8, maxHeight: 420, overflow: 'auto', paddingRight: 6 }}>
              {preview.groups.map((g) => {
                const visibleIds = g.elementIds.filter((id) => {
                  const c = candidateById.get(id);
                  if (!c) return false;
                  return matchesCandidate({ c, q: search });
                });

                const totalNew = g.elementIds.filter((id) => !existingSet.has(id)).length;
                const visibleNew = visibleIds.filter((id) => !existingSet.has(id)).length;

                return (
                  <details
                    key={g.depth}
                    open
                    style={{
                      marginBottom: 10,
                      padding: 8,
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                    }}
                  >
                    <summary style={{ cursor: 'pointer' }}>
                      <span className="crudHint" style={{ margin: 0 }}>
                        Depth {g.depth}: {g.elementIds.length} element(s) · new {totalNew} (visible new {visibleNew})
                      </span>
                    </summary>

                    {visibleIds.length ? (
                      <div style={{ marginTop: 8 }}>
                        <SandboxInsertElementList
                          model={model}
                          elementIds={visibleIds}
                          existingSet={existingSet}
                          selectedIds={selectedIds}
                          onToggleId={toggleSelectedId}
                          disableExisting={false}
                        />
                      </div>
                    ) : (
                      <p className="crudHint" style={{ margin: 0, marginTop: 8 }}>
                        No related candidates match the current filters.
                      </p>
                    )}
                  </details>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <p className="crudHint" style={{ marginTop: 8 }}>
          Computing preview…
        </p>
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Model } from '../../../domain';
import type {
  SandboxAddRelatedDirection,
  SandboxInsertIntermediatesMode,
  SandboxInsertIntermediatesOptions,
} from '../workspace/controller/useSandboxState';
import { bfsKShortestPaths, bfsShortestPath, buildAdjacency } from '../workspace/controller/useSandboxState';

import { Dialog } from '../../dialog/Dialog';

type PreviewPath = {
  path: string[];
  intermediates: string[];
};

type Candidate = {
  id: string;
  name: string;
  type: string;
  alreadyInSandbox: boolean;
};

type PreviewState = {
  paths: PreviewPath[];
  candidates: Candidate[];
};

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  const iv = Math.round(v);
  if (iv < min) return min;
  if (iv > max) return max;
  return iv;
}

function toggleString(values: string[], v: string): string[] {
  const set = new Set(values);
  if (set.has(v)) set.delete(v);
  else set.add(v);
  return Array.from(set);
}

type Props = {
  isOpen: boolean;
  model: Model;
  sourceElementId: string;
  targetElementId: string;
  existingElementIds: string[];
  allRelationshipTypes: string[];
  initialEnabledRelationshipTypes: string[];
  initialOptions: Pick<SandboxInsertIntermediatesOptions, 'mode' | 'k' | 'maxHops' | 'direction'>;
  onCancel: () => void;
  onConfirm: (args: {
    enabledRelationshipTypes: string[];
    options: Pick<SandboxInsertIntermediatesOptions, 'mode' | 'k' | 'maxHops' | 'direction'>;
    selectedElementIds: string[];
  }) => void;
};

export function SandboxInsertBetweenDialog({
  isOpen,
  model,
  sourceElementId,
  targetElementId,
  existingElementIds,
  allRelationshipTypes,
  initialEnabledRelationshipTypes,
  initialOptions,
  onCancel,
  onConfirm,
}: Props) {
  const existingSet = useMemo(() => new Set(existingElementIds), [existingElementIds]);

  const [mode, setMode] = useState<SandboxInsertIntermediatesMode>('shortest');
  const [k, setK] = useState(3);
  const [maxHops, setMaxHops] = useState(8);
  const [direction, setDirection] = useState<SandboxAddRelatedDirection>('both');
  const [enabledTypes, setEnabledTypes] = useState<string[]>([]);

  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setMode(initialOptions.mode);
    setK(clampInt(initialOptions.k, 1, 10));
    setMaxHops(clampInt(initialOptions.maxHops, 1, 16));
    setDirection(initialOptions.direction);
    setEnabledTypes(initialEnabledRelationshipTypes.length ? initialEnabledRelationshipTypes : allRelationshipTypes);
    setPreview(null);
    setSelectedIds(new Set());
    setError(null);
  }, [allRelationshipTypes, initialEnabledRelationshipTypes, initialOptions, isOpen]);

  const computePreview = useCallback(() => {
    if (!isOpen) return;
    setError(null);

    if (!sourceElementId || !targetElementId) {
      setError('Missing endpoints.');
      setPreview(null);
      return;
    }
    if (sourceElementId === targetElementId) {
      setError('Endpoints must be different.');
      setPreview(null);
      return;
    }
    if (enabledTypes.length === 0) {
      setError('Select at least one relationship type.');
      setPreview(null);
      return;
    }

    const allowedTypes = new Set(enabledTypes);
    const adjacency = buildAdjacency(model, allowedTypes);
    const maxH = clampInt(maxHops, 1, 16);
    const kk = clampInt(k, 1, 10);

    const paths: string[][] =
      mode === 'topk'
        ? bfsKShortestPaths({
            startId: sourceElementId,
            targetId: targetElementId,
            adjacency,
            direction,
            maxHops: maxH,
            k: kk,
          })
        : (() => {
            const p = bfsShortestPath({
              startId: sourceElementId,
              targetId: targetElementId,
              adjacency,
              direction,
              maxHops: maxH,
            });
            return p ? [p] : [];
          })();

    if (paths.length === 0) {
      setError('No paths found for the current settings.');
      setPreview({ paths: [], candidates: [] });
      setSelectedIds(new Set());
      return;
    }

    const previewPaths: PreviewPath[] = paths.map((p) => {
      const intermediates = p
        .slice(1, -1)
        .filter((id) => typeof id === 'string' && id.length > 0 && Boolean(model.elements[id]));
      return { path: p, intermediates };
    });

    const candidateMap = new Map<string, Candidate>();
    for (const pp of previewPaths) {
      for (const id of pp.intermediates) {
        if (candidateMap.has(id)) continue;
        const el = model.elements[id];
        if (!el) continue;
        candidateMap.set(id, {
          id,
          name: el.name || '(unnamed)',
          type: el.type,
          alreadyInSandbox: existingSet.has(id),
        });
      }
    }

    const candidates = Array.from(candidateMap.values()).sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
    const nextSelected = new Set<string>();
    for (const c of candidates) {
      if (!c.alreadyInSandbox) nextSelected.add(c.id);
    }

    setPreview({ paths: previewPaths, candidates });
    setSelectedIds(nextSelected);
  }, [direction, enabledTypes, existingSet, isOpen, k, maxHops, mode, model, sourceElementId, targetElementId]);

  const selectedCount = selectedIds.size;
  const candidatesCount = preview?.candidates.length ?? 0;

  const canInsert = preview !== null && selectedCount > 0 && enabledTypes.length > 0;

  return (
    <Dialog
      title="Insert intermediate elements"
      isOpen={isOpen}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="shellButton" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="shellButton" onClick={computePreview}>
            Preview
          </button>
          <button
            type="button"
            className="shellButton"
            disabled={!canInsert}
            onClick={() =>
              onConfirm({
                enabledRelationshipTypes: enabledTypes,
                options: { mode, k: clampInt(k, 1, 10), maxHops: clampInt(maxHops, 1, 16), direction },
                selectedElementIds: Array.from(selectedIds),
              })
            }
          >
            Insert selected
          </button>
        </>
      }
    >
      <div className="formGrid">
        <div className="formRow">
          <label>Between</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="crudHint" style={{ margin: 0 }}>
              {model.elements[sourceElementId]?.name || sourceElementId}
            </span>
            <span className="crudHint" style={{ margin: 0 }}>
              →
            </span>
            <span className="crudHint" style={{ margin: 0 }}>
              {model.elements[targetElementId]?.name || targetElementId}
            </span>
          </div>
        </div>

        <div className="formRow">
          <label htmlFor="sandbox-insert-mode">Mode</label>
          <select
            id="sandbox-insert-mode"
            className="selectInput"
            value={mode}
            onChange={(e) => setMode(e.currentTarget.value as SandboxInsertIntermediatesMode)}
          >
            <option value="shortest">Shortest path</option>
            <option value="topk">Top-K shortest paths</option>
          </select>
        </div>

        <div className="formRow">
          <label htmlFor="sandbox-insert-k">K</label>
          <input
            id="sandbox-insert-k"
            className="textInput"
            type="number"
            min={1}
            max={10}
            value={k}
            disabled={mode !== 'topk'}
            aria-disabled={mode !== 'topk'}
            onChange={(e) => setK(Number(e.currentTarget.value))}
          />
        </div>

        <div className="formRow">
          <label htmlFor="sandbox-insert-maxhops">Max hops</label>
          <input
            id="sandbox-insert-maxhops"
            className="textInput"
            type="number"
            min={1}
            max={16}
            value={maxHops}
            onChange={(e) => setMaxHops(Number(e.currentTarget.value))}
          />
        </div>

        <div className="formRow">
          <label htmlFor="sandbox-insert-direction">Direction</label>
          <select
            id="sandbox-insert-direction"
            className="selectInput"
            value={direction}
            onChange={(e) => setDirection(e.currentTarget.value as SandboxAddRelatedDirection)}
          >
            <option value="both">Both</option>
            <option value="outgoing">Outgoing</option>
            <option value="incoming">Incoming</option>
          </select>
        </div>

        <div className="formRow">
          <label>Relationship types</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="miniLinkButton"
              onClick={() => setEnabledTypes(allRelationshipTypes)}
              disabled={allRelationshipTypes.length === 0}
              aria-disabled={allRelationshipTypes.length === 0}
            >
              All
            </button>
            <button
              type="button"
              className="miniLinkButton"
              onClick={() => setEnabledTypes([])}
              disabled={allRelationshipTypes.length === 0}
              aria-disabled={allRelationshipTypes.length === 0}
            >
              None
            </button>
            <span className="crudHint" style={{ margin: 0 }}>
              {enabledTypes.length}/{allRelationshipTypes.length}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6, marginTop: 6 }}>
            {allRelationshipTypes.map((t) => {
              const checked = enabledTypes.includes(t);
              return (
                <label key={t} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => setEnabledTypes((prev) => toggleString(prev, t))}
                  />
                  <span>{t}</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        {error ? <p className="crudHint">{error}</p> : null}

        {preview ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <p className="crudHint" style={{ margin: 0 }}>
                Preview: {candidatesCount} candidate element(s) · Selected: {selectedCount}
              </p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  className="miniLinkButton"
                  onClick={() => {
                    const next = new Set<string>();
                    for (const c of preview.candidates) {
                      if (!c.alreadyInSandbox) next.add(c.id);
                    }
                    setSelectedIds(next);
                  }}
                >
                  Select all new
                </button>
                <button type="button" className="miniLinkButton" onClick={() => setSelectedIds(new Set())}>
                  Select none
                </button>
              </div>
            </div>

            {preview.paths.length ? (
              <div style={{ marginTop: 8 }}>
                {preview.paths.map((p, idx) => (
                  <div key={idx} style={{ marginBottom: 10, padding: 8, border: '1px solid var(--border)', borderRadius: 8 }}>
                    <p className="crudHint" style={{ margin: 0, marginBottom: 6 }}>
                      Path {idx + 1}: {p.path.length} node(s)
                    </p>
                    {p.intermediates.length ? (
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
                        {p.intermediates.map((id) => {
                          const el = model.elements[id];
                          if (!el) return null;
                          const already = existingSet.has(id);
                          const checked = selectedIds.has(id);
                          return (
                            <li key={`${idx}-${id}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={already}
                                aria-disabled={already}
                                onChange={() => setSelectedIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(id)) next.delete(id);
                                  else next.add(id);
                                  return next;
                                })}
                              />
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span>{el.name || '(unnamed)'}</span>
                                <span className="crudHint" style={{ margin: 0 }}>
                                  {el.type}{already ? ' · already in sandbox' : ''}
                                </span>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="crudHint" style={{ margin: 0 }}>
                        No intermediate elements in this path.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <p className="crudHint" style={{ marginTop: 8 }}>
            Click “Preview” to see which elements will be inserted.
          </p>
        )}
      </div>
    </Dialog>
  );
}

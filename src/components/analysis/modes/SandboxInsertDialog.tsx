import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Model } from '../../../domain';
import type {
  SandboxAddRelatedDirection,
  SandboxInsertIntermediatesMode,
  SandboxInsertIntermediatesOptions,
} from '../workspace/controller/useSandboxState';
import { bfsKShortestPaths, bfsShortestPath, buildAdjacency } from '../workspace/controller/useSandboxState';

import { Dialog } from '../../dialog/Dialog';

type Candidate = {
  id: string;
  name: string;
  type: string;
  alreadyInSandbox: boolean;
};

type PreviewPath = {
  path: string[];
  intermediates: string[];
};

type PreviewIntermediates = {
  kind: 'intermediates';
  paths: PreviewPath[];
  candidates: Candidate[];
};

type PreviewRelated = {
  kind: 'related';
  byDepth: Array<{ depth: number; elementIds: string[] }>;
  candidates: Candidate[];
};

type PreviewState = PreviewIntermediates | PreviewRelated;

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

function getNeighbors(args: {
  adjacency: ReturnType<typeof buildAdjacency>;
  id: string;
  direction: SandboxAddRelatedDirection;
}): string[] {
  const { adjacency, id, direction } = args;
  const out: string[] = [];
  if (direction === 'both' || direction === 'outgoing') {
    for (const e of adjacency.out.get(id) ?? []) out.push(e.to);
  }
  if (direction === 'both' || direction === 'incoming') {
    for (const e of adjacency.in.get(id) ?? []) out.push(e.to);
  }
  return out;
}

type IntermediatesProps = {
  kind: 'intermediates';
  sourceElementId: string;
  targetElementId: string;
  /** Label for the endpoint row (e.g. "Between" or "From relationship"). */
  contextLabel?: string;
  /** Optional relationship type label shown next to the endpoint row. */
  contextRelationshipType?: string;
  initialOptions: Pick<SandboxInsertIntermediatesOptions, 'mode' | 'k' | 'maxHops' | 'direction'>;
  onConfirm: (args: {
    enabledRelationshipTypes: string[];
    options: Pick<SandboxInsertIntermediatesOptions, 'mode' | 'k' | 'maxHops' | 'direction'>;
    selectedElementIds: string[];
  }) => void;
};

type RelatedProps = {
  kind: 'related';
  anchorElementIds: string[];
  initialOptions: { depth: number; direction: SandboxAddRelatedDirection };
  onConfirm: (args: {
    enabledRelationshipTypes: string[];
    options: { depth: number; direction: SandboxAddRelatedDirection };
    selectedElementIds: string[];
  }) => void;
};

type BaseProps = {
  isOpen: boolean;
  model: Model;
  existingElementIds: string[];
  allRelationshipTypes: string[];
  initialEnabledRelationshipTypes: string[];
  onCancel: () => void;
};

type Props = BaseProps & (IntermediatesProps | RelatedProps);

export function SandboxInsertDialog(props: Props) {
  const {
    isOpen,
    model,
    existingElementIds,
    allRelationshipTypes,
    initialEnabledRelationshipTypes,
    onCancel,
  } = props;

  const existingSet = useMemo(() => new Set(existingElementIds), [existingElementIds]);

  // Shared settings
  const [direction, setDirection] = useState<SandboxAddRelatedDirection>('both');
  const [enabledTypes, setEnabledTypes] = useState<string[]>([]);

  // Intermediates settings
  const [mode, setMode] = useState<SandboxInsertIntermediatesMode>('shortest');
  const [k, setK] = useState(3);
  const [maxHops, setMaxHops] = useState(8);

  // Related settings
  const [depth, setDepth] = useState(1);

  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setEnabledTypes(initialEnabledRelationshipTypes.length ? initialEnabledRelationshipTypes : allRelationshipTypes);
    setPreview(null);
    setSelectedIds(new Set());
    setError(null);

    if (props.kind === 'intermediates') {
      setMode(props.initialOptions.mode);
      setK(clampInt(props.initialOptions.k, 1, 10));
      setMaxHops(clampInt(props.initialOptions.maxHops, 1, 16));
      setDirection(props.initialOptions.direction);
    } else {
      setDepth(clampInt(props.initialOptions.depth, 1, 6));
      setDirection(props.initialOptions.direction);
    }
  }, [allRelationshipTypes, initialEnabledRelationshipTypes, isOpen, props]);

  const computePreview = useCallback(() => {
    if (!isOpen) return;
    setError(null);

    if (enabledTypes.length === 0) {
      setError('Select at least one relationship type.');
      setPreview(null);
      return;
    }

    const allowedTypes = new Set(enabledTypes);
    const adjacency = buildAdjacency(model, allowedTypes);

    if (props.kind === 'intermediates') {
      const { sourceElementId, targetElementId } = props;
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
        setPreview({ kind: 'intermediates', paths: [], candidates: [] });
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

      const candidates = Array.from(candidateMap.values()).sort(
        (a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)
      );
      const nextSelected = new Set<string>();
      for (const c of candidates) {
        if (!c.alreadyInSandbox) nextSelected.add(c.id);
      }

      setPreview({ kind: 'intermediates', paths: previewPaths, candidates });
      setSelectedIds(nextSelected);
      return;
    }

    // Related preview
    const anchors = props.anchorElementIds.filter((id) => Boolean(model.elements[id]));
    if (anchors.length === 0) {
      setError('Select one or more anchor nodes.');
      setPreview(null);
      return;
    }

    const depthLimit = clampInt(depth, 1, 6);
    const visited = new Set<string>(anchors);
    const q: Array<{ id: string; depth: number }> = anchors.map((id) => ({ id, depth: 0 }));
    const depthById = new Map<string, number>();

    while (q.length) {
      const cur = q.shift();
      if (!cur) break;
      if (cur.depth >= depthLimit) continue;
      const nextDepth = cur.depth + 1;
      for (const nb of getNeighbors({ adjacency, id: cur.id, direction })) {
        if (visited.has(nb)) continue;
        if (!model.elements[nb]) continue;
        visited.add(nb);
        depthById.set(nb, nextDepth);
        q.push({ id: nb, depth: nextDepth });
      }
    }

    const byDepth = new Map<number, string[]>();
    for (const [id, d] of depthById.entries()) {
      if (!byDepth.has(d)) byDepth.set(d, []);
      byDepth.get(d)!.push(id);
    }
    const groups = Array.from(byDepth.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([d, ids]) => ({
        depth: d,
        elementIds: ids.slice().sort((a, b) => a.localeCompare(b)),
      }));

    const candidateMap = new Map<string, Candidate>();
    for (const g of groups) {
      for (const id of g.elementIds) {
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
    const candidates = Array.from(candidateMap.values()).sort(
      (a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)
    );
    const nextSelected = new Set<string>();
    for (const c of candidates) {
      if (!c.alreadyInSandbox) nextSelected.add(c.id);
    }

    setPreview({ kind: 'related', byDepth: groups, candidates });
    setSelectedIds(nextSelected);
  }, [depth, direction, enabledTypes, existingSet, isOpen, k, maxHops, mode, model, props]);

  const selectedCount = selectedIds.size;
  const candidatesCount = preview?.candidates.length ?? 0;
  const canInsert = preview !== null && selectedCount > 0 && enabledTypes.length > 0;

  const title = props.kind === 'related' ? 'Add related elements' : 'Insert intermediate elements';

  return (
    <Dialog
      title={title}
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
            onClick={() => {
              const selectedElementIds = Array.from(selectedIds);
              if (props.kind === 'intermediates') {
                props.onConfirm({
                  enabledRelationshipTypes: enabledTypes,
                  options: {
                    mode,
                    k: clampInt(k, 1, 10),
                    maxHops: clampInt(maxHops, 1, 16),
                    direction,
                  },
                  selectedElementIds,
                });
              } else {
                props.onConfirm({
                  enabledRelationshipTypes: enabledTypes,
                  options: { depth: clampInt(depth, 1, 6), direction },
                  selectedElementIds,
                });
              }
            }}
          >
            {props.kind === 'related' ? 'Add selected' : 'Insert selected'}
          </button>
        </>
      }
    >
      <div className="formGrid">
        {props.kind === 'intermediates' ? (
          <div className="formRow">
            <label>{props.contextLabel || 'Between'}</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="crudHint" style={{ margin: 0 }}>
                {model.elements[props.sourceElementId]?.name || props.sourceElementId}
              </span>
              <span className="crudHint" style={{ margin: 0 }}>
                →
              </span>
              <span className="crudHint" style={{ margin: 0 }}>
                {model.elements[props.targetElementId]?.name || props.targetElementId}
              </span>
              {props.contextRelationshipType ? (
                <span className="crudHint" style={{ margin: 0 }}>
                  · {props.contextRelationshipType}
                </span>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="formRow">
            <label>From</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {props.anchorElementIds.slice(0, 3).map((id) => (
                <span key={id} className="crudHint" style={{ margin: 0 }}>
                  {model.elements[id]?.name || id}
                </span>
              ))}
              {props.anchorElementIds.length > 3 ? (
                <span className="crudHint" style={{ margin: 0 }}>
                  · +{props.anchorElementIds.length - 3} more
                </span>
              ) : null}
            </div>
          </div>
        )}

        {props.kind === 'intermediates' ? (
          <>
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
          </>
        ) : (
          <div className="formRow">
            <label htmlFor="sandbox-related-depth">Depth</label>
            <input
              id="sandbox-related-depth"
              className="textInput"
              type="number"
              min={1}
              max={6}
              value={depth}
              onChange={(e) => setDepth(Number(e.currentTarget.value))}
            />
          </div>
        )}

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

            {preview.kind === 'intermediates' ? (
              <div style={{ marginTop: 8 }}>
                {preview.paths.map((p, idx) => (
                  <div
                    key={idx}
                    style={{
                      marginBottom: 10,
                      padding: 8,
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                    }}
                  >
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
                                onChange={() =>
                                  setSelectedIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(id)) next.delete(id);
                                    else next.add(id);
                                    return next;
                                  })
                                }
                              />
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span>{el.name || '(unnamed)'}</span>
                                <span className="crudHint" style={{ margin: 0 }}>
                                  {el.type}
                                  {already ? ' · already in sandbox' : ''}
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
            ) : (
              <div style={{ marginTop: 8 }}>
                {preview.byDepth.map((g) => (
                  <div
                    key={g.depth}
                    style={{
                      marginBottom: 10,
                      padding: 8,
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                    }}
                  >
                    <p className="crudHint" style={{ margin: 0, marginBottom: 6 }}>
                      Depth {g.depth}: {g.elementIds.length} element(s)
                    </p>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
                      {g.elementIds.map((id) => {
                        const el = model.elements[id];
                        if (!el) return null;
                        const already = existingSet.has(id);
                        const checked = selectedIds.has(id);
                        return (
                          <li key={`${g.depth}-${id}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={already}
                              aria-disabled={already}
                              onChange={() =>
                                setSelectedIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(id)) next.delete(id);
                                  else next.add(id);
                                  return next;
                                })
                              }
                            />
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span>{el.name || '(unnamed)'}</span>
                              <span className="crudHint" style={{ margin: 0 }}>
                                {el.type}
                                {already ? ' · already in sandbox' : ''}
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
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

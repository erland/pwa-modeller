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

type RelatedGroup = {
  depth: number;
  elementIds: string[];
};

type Candidate = {
  id: string;
  name: string;
  type: string;
  alreadyInSandbox: boolean;
};

type PreviewState =
  | {
      kind: 'intermediates';
      paths: PreviewPath[];
      candidates: Candidate[];
    }
  | {
      kind: 'related';
      groups: RelatedGroup[];
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

type IntermediatesConfirmArgs = {
  kind: 'intermediates';
  enabledRelationshipTypes: string[];
  options: Pick<SandboxInsertIntermediatesOptions, 'mode' | 'k' | 'maxHops' | 'direction'>;
  selectedElementIds: string[];
};

type RelatedConfirmArgs = {
  kind: 'related';
  enabledRelationshipTypes: string[];
  options: { depth: number; direction: SandboxAddRelatedDirection };
  selectedElementIds: string[];
};

type CommonProps = {
  isOpen: boolean;
  model: Model;
  existingElementIds: string[];
  allRelationshipTypes: string[];
  initialEnabledRelationshipTypes: string[];
  onCancel: () => void;
  onConfirm: (args: IntermediatesConfirmArgs | RelatedConfirmArgs) => void;
};

type IntermediatesProps = CommonProps & {
  kind: 'intermediates';
  sourceElementId: string;
  targetElementId: string;
  /** Label for the endpoint row (e.g. "Between" or "From relationship"). */
  contextLabel?: string;
  /** Optional relationship type label shown next to the endpoint row. */
  contextRelationshipType?: string;
  initialOptions: Pick<SandboxInsertIntermediatesOptions, 'mode' | 'k' | 'maxHops' | 'direction'>;
};

type RelatedProps = CommonProps & {
  kind: 'related';
  anchorElementIds: string[];
  contextLabel?: string;
  initialOptions: { depth: number; direction: SandboxAddRelatedDirection };
};

type Props = IntermediatesProps | RelatedProps;

export function SandboxInsertBetweenDialog(props: Props) {
  const {
    isOpen,
    model,
    existingElementIds,
    allRelationshipTypes,
    initialEnabledRelationshipTypes,
    onCancel,
    onConfirm,
  } = props;

  const existingSet = useMemo(() => new Set(existingElementIds), [existingElementIds]);

  const [mode, setMode] = useState<SandboxInsertIntermediatesMode>('shortest');
  const [k, setK] = useState(3);
  const [maxHops, setMaxHops] = useState(8);
  const [direction, setDirection] = useState<SandboxAddRelatedDirection>('both');
  const [depth, setDepth] = useState(1);
  const [enabledTypes, setEnabledTypes] = useState<string[]>([]);

  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  
  const enabledKey = useMemo(() => {
    const base = initialEnabledRelationshipTypes.length ? initialEnabledRelationshipTypes : allRelationshipTypes;
    return base.join('|');
  }, [allRelationshipTypes, initialEnabledRelationshipTypes]);

  const kind = props.kind;
  const sourceElementId = kind === 'intermediates' ? props.sourceElementId : '';
  const targetElementId = kind === 'intermediates' ? props.targetElementId : '';
  const anchorKey = kind === 'related' ? props.anchorElementIds.join(',') : '';

  const initMode = kind === 'intermediates' ? props.initialOptions.mode : 'shortest';
  const initK = kind === 'intermediates' ? props.initialOptions.k : 3;
  const initMaxHops = kind === 'intermediates' ? props.initialOptions.maxHops : 8;
  const initDirection = props.initialOptions.direction;

  const initDepth = kind === 'related' ? props.initialOptions.depth : 1;

  const resetKey = useMemo(() => {
    return kind === 'intermediates'
      ? `i|${sourceElementId}|${targetElementId}|${initMode}|${initK}|${initMaxHops}|${initDirection}|${enabledKey}`
      : `r|${anchorKey}|${initDepth}|${initDirection}|${enabledKey}`;
  }, [anchorKey, enabledKey, initDepth, initDirection, initK, initMaxHops, initMode, kind, sourceElementId, targetElementId]);

  useEffect(() => {
    if (!isOpen) return;

    setEnabledTypes(initialEnabledRelationshipTypes.length ? initialEnabledRelationshipTypes : allRelationshipTypes);
    setPreview(null);
    setSelectedIds(new Set());
    setError(null);

    if (kind === 'intermediates') {
      setMode(initMode);
      setK(clampInt(initK, 1, 10));
      setMaxHops(clampInt(initMaxHops, 1, 16));
      setDirection(initDirection);
      setDepth(1);
    } else {
      setMode('shortest');
      setK(3);
      setMaxHops(8);
      setDirection(initDirection);
      setDepth(clampInt(initDepth, 1, 6));
    }
  }, [allRelationshipTypes, initDepth, initDirection, initK, initMaxHops, initMode, initialEnabledRelationshipTypes, isOpen, kind, resetKey]);

  const title = props.kind === 'related' ? 'Add related elements' : 'Insert intermediate elements';

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
      const sourceElementId = props.sourceElementId;
      const targetElementId = props.targetElementId;

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

    // related
    const anchorIds = props.anchorElementIds.filter((id) => typeof id === 'string' && id.length > 0 && Boolean(model.elements[id]));
    if (anchorIds.length === 0) {
      setError('Select one or more sandbox nodes as anchors.');
      setPreview(null);
      return;
    }

    const depthLimit = clampInt(depth, 1, 6);
    const depthById = new Map<string, number>();
    const byDepth = new Map<number, string[]>();

    const q: Array<{ id: string; depth: number }> = anchorIds.map((id) => ({ id, depth: 0 }));
    for (const a of anchorIds) depthById.set(a, 0);

    while (q.length) {
      const cur = q.shift();
      if (!cur) break;
      if (cur.depth >= depthLimit) continue;

      const neighbors: string[] = [];
      if (direction === 'both' || direction === 'outgoing') {
        for (const e of adjacency.out.get(cur.id) ?? []) neighbors.push(e.to);
      }
      if (direction === 'both' || direction === 'incoming') {
        for (const e of adjacency.in.get(cur.id) ?? []) neighbors.push(e.to);
      }

      const nextDepth = cur.depth + 1;
      for (const nb of neighbors) {
        if (depthById.has(nb)) continue;
        if (!model.elements[nb]) continue;
        depthById.set(nb, nextDepth);
        if (!byDepth.has(nextDepth)) byDepth.set(nextDepth, []);
        byDepth.get(nextDepth)!.push(nb);
        q.push({ id: nb, depth: nextDepth });
      }
    }

    const groups: RelatedGroup[] = [];
    const candidateMap = new Map<string, Candidate>();

    for (let d = 1; d <= depthLimit; d++) {
      const ids = (byDepth.get(d) ?? []).slice();
      if (ids.length === 0) continue;

      // stable ordering by element type + name
      ids.sort((a, b) => {
        const ea = model.elements[a];
        const eb = model.elements[b];
        const ta = ea?.type ?? '';
        const tb = eb?.type ?? '';
        const na = ea?.name ?? a;
        const nb = eb?.name ?? b;
        return ta.localeCompare(tb) || na.localeCompare(nb);
      });

      groups.push({ depth: d, elementIds: ids });

      for (const id of ids) {
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

    if (candidates.length === 0) {
      setError('No related elements found for the current settings.');
    }

    setPreview({ kind: 'related', groups, candidates });
    setSelectedIds(nextSelected);
  }, [depth, direction, enabledTypes, existingSet, isOpen, k, maxHops, mode, model, props]);

  const selectedCount = selectedIds.size;
  const candidatesCount = preview?.candidates.length ?? 0;

  const canInsert = preview !== null && selectedCount > 0 && enabledTypes.length > 0;

  const renderContext = () => {
    if (props.kind === 'intermediates') {
      return (
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
      );
    }

    const anchors = props.anchorElementIds
      .filter((id) => Boolean(model.elements[id]))
      .map((id) => model.elements[id]?.name || id)
      .slice(0, 6);

    const more = props.anchorElementIds.length - anchors.length;

    return (
      <div className="formRow">
        <label>{props.contextLabel || 'From anchors'}</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {anchors.length ? (
            <span className="crudHint" style={{ margin: 0 }}>
              {anchors.join(', ')}
              {more > 0 ? ` (+${more})` : ''}
            </span>
          ) : (
            <span className="crudHint" style={{ margin: 0 }}>
              (none)
            </span>
          )}
        </div>
      </div>
    );
  };

  const renderOptions = () => {
    if (props.kind === 'related') {
      return (
        <>
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

          <div className="formRow">
            <label htmlFor="sandbox-related-direction">Direction</label>
            <select
              id="sandbox-related-direction"
              className="selectInput"
              value={direction}
              onChange={(e) => setDirection(e.currentTarget.value as SandboxAddRelatedDirection)}
            >
              <option value="both">Both</option>
              <option value="outgoing">Outgoing</option>
              <option value="incoming">Incoming</option>
            </select>
          </div>
        </>
      );
    }

    return (
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
      </>
    );
  };

  const renderPreview = () => {
    if (!preview) {
      return (
        <p className="crudHint" style={{ marginTop: 8 }}>
          Click “Preview” to see which elements will be inserted.
        </p>
      );
    }

    const selectAllNew = () => {
      const next = new Set<string>();
      for (const c of preview.candidates) {
        if (!c.alreadyInSandbox) next.add(c.id);
      }
      setSelectedIds(next);
    };

    const toggleId = (id: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    };

    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <p className="crudHint" style={{ margin: 0 }}>
            Preview: {candidatesCount} candidate element(s) · Selected: {selectedCount}
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" className="miniLinkButton" onClick={selectAllNew}>
              Select all new
            </button>
            <button type="button" className="miniLinkButton" onClick={() => setSelectedIds(new Set())}>
              Select none
            </button>
          </div>
        </div>

        {preview.kind === 'intermediates' ? (
          preview.paths.length ? (
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
                              onChange={() => toggleId(id)}
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
          ) : null
        ) : (
          <div style={{ marginTop: 8 }}>
            {preview.groups.length ? (
              preview.groups.map((g) => (
                <div key={g.depth} style={{ marginBottom: 10, padding: 8, border: '1px solid var(--border)', borderRadius: 8 }}>
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
                            onChange={() => toggleId(id)}
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
              ))
            ) : (
              <p className="crudHint" style={{ margin: 0 }}>
                No candidates found.
              </p>
            )}
          </div>
        )}
      </>
    );
  };

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
              if (!preview) return;

              const enabledRelationshipTypes = enabledTypes;

              if (props.kind === 'related') {
                onConfirm({
                  kind: 'related',
                  enabledRelationshipTypes,
                  options: { depth: clampInt(depth, 1, 6), direction },
                  selectedElementIds: Array.from(selectedIds),
                });
                return;
              }

              onConfirm({
                kind: 'intermediates',
                enabledRelationshipTypes,
                options: { mode, k: clampInt(k, 1, 10), maxHops: clampInt(maxHops, 1, 16), direction },
                selectedElementIds: Array.from(selectedIds),
              });
            }}
          >
            Insert selected
          </button>
        </>
      }
    >
      <div className="formGrid">
        {renderContext()}

        {renderOptions()}

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
                  <input type="checkbox" checked={checked} onChange={() => setEnabledTypes((prev) => toggleString(prev, t))} />
                  <span>{t}</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        {error ? <p className="crudHint">{error}</p> : null}
        {renderPreview()}
      </div>
    </Dialog>
  );
}

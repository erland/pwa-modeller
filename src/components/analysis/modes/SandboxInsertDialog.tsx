import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Model } from '../../../domain';
import {
  bfsKShortestPaths,
  bfsShortestPath,
  buildAdjacency,
  getElementTypeLabel,
  getRelationshipTypeLabel,
  getRelationshipTypesForKind,
  kindFromTypeId,
} from '../../../domain';
import type {
  SandboxAddRelatedDirection,
  SandboxInsertIntermediatesMode,
  SandboxInsertIntermediatesOptions,
} from '../workspace/controller/sandboxTypes';

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

function normalizeText(v: string): string {
  return (v || '').trim().toLowerCase();
}

function matchesCandidate(args: { c: Candidate; q: string }): boolean {
  const q = normalizeText(args.q);
  if (!q) return true;
  const c = args.c;
  const hay = `${c.name} ${c.type} ${c.id}`.toLowerCase();
  return hay.includes(q);
}

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

function uniqSortedStrings(values: string[]): string[] {
  return Array.from(new Set(values)).filter((v) => typeof v === 'string' && v.length > 0).sort((a, b) => a.localeCompare(b));
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
  /** Optional node cap; used only for dialog warnings (actual cap is enforced by sandbox state). */
  maxNodes?: number;
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

  const allElementTypesForModel = useMemo(() => {
    const types = Object.values(model.elements).map((e) => String(e.type ?? ''));
    return uniqSortedStrings(types);
  }, [model]);

  const relationshipTypesForDialog = useMemo(() => {
    const kinds = new Set<string>();
    if (props.kind === 'intermediates') {
      const s = model.elements[props.sourceElementId];
      const t = model.elements[props.targetElementId];
      if (s) kinds.add(kindFromTypeId(s.type));
      if (t) kinds.add(kindFromTypeId(t.type));
    } else {
      for (const id of props.anchorElementIds) {
        const el = model.elements[id];
        if (!el) continue;
        kinds.add(kindFromTypeId(el.type));
      }
    }

    // If we can infer kinds from the selection, only show relationship types compatible with those kinds.
    // Always keep it restricted to what actually exists in the model.
    const allowed = new Set<string>();
    for (const k of kinds) {
      if (k === 'uml' || k === 'bpmn' || k === 'archimate') {
        for (const rt of getRelationshipTypesForKind(k as any)) allowed.add(rt);
      }
    }

    const base = Array.isArray(allRelationshipTypes) ? allRelationshipTypes : [];
    if (allowed.size === 0) return base;
    return base.filter((t) => allowed.has(t));
  }, [allRelationshipTypes, model, props]);

  // Shared settings
  const [direction, setDirection] = useState<SandboxAddRelatedDirection>('both');
  const [enabledTypes, setEnabledTypes] = useState<string[]>([]);
  const [enabledElementTypes, setEnabledElementTypes] = useState<string[]>([]);

  // Intermediates settings
  const [mode, setMode] = useState<SandboxInsertIntermediatesMode>('shortest');
  const [k, setK] = useState(3);
  const [maxHops, setMaxHops] = useState(8);

  // Related settings
  const [depth, setDepth] = useState(1);

  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // List usability
  const [search, setSearch] = useState('');
  const selectedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  const enabledElementTypesSet = useMemo(() => new Set(enabledElementTypes), [enabledElementTypes]);

  useEffect(() => {
    if (!isOpen) return;
    const allowedRelSet = new Set(relationshipTypesForDialog);
    const initRel = (initialEnabledRelationshipTypes.length ? initialEnabledRelationshipTypes : relationshipTypesForDialog).filter((t) =>
      allowedRelSet.has(t)
    );
    setEnabledTypes(initRel.length ? initRel : relationshipTypesForDialog);
    setEnabledElementTypes(allElementTypesForModel);
    setPreview(null);
    setSelectedIds(new Set());
    setError(null);

    setSearch('');

    if (props.kind === 'intermediates') {
      setMode(props.initialOptions.mode);
      setK(clampInt(props.initialOptions.k, 1, 10));
      setMaxHops(clampInt(props.initialOptions.maxHops, 1, 16));
      setDirection(props.initialOptions.direction);
    } else {
      setDepth(clampInt(props.initialOptions.depth, 1, 6));
      setDirection(props.initialOptions.direction);
    }
  }, [allElementTypesForModel, initialEnabledRelationshipTypes, isOpen, props, relationshipTypesForDialog]);

  // Keep enabled relationship types valid if the inferred compatible types change (e.g. different selection).
  useEffect(() => {
    if (!isOpen) return;
    const allowed = new Set(relationshipTypesForDialog);
    setEnabledTypes((prev) => {
      const next = prev.filter((t) => allowed.has(t));
      // If nothing is left, default to all compatible relationship types for the current selection.
      return next.length ? next : relationshipTypesForDialog;
    });
  }, [isOpen, relationshipTypesForDialog]);

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
          if (!enabledElementTypesSet.has(el.type)) continue;
          if (existingSet.has(id)) continue;
          candidateMap.set(id, {
            id,
            name: el.name || '(unnamed)',
            type: el.type,
            alreadyInSandbox: false,
          });
        }
      }

      const candidates = Array.from(candidateMap.values()).sort(
        (a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)
      );
      const prevSelected = selectedIdsRef.current;
      const nextSelected = new Set<string>();
      for (const c of candidates) {
        if (c.alreadyInSandbox) continue;
        // Preserve explicit user selection if possible. If no prior selection, default to selecting all new.
        if (prevSelected.size === 0 || prevSelected.has(c.id)) nextSelected.add(c.id);
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
        if (!enabledElementTypesSet.has(el.type)) continue;
        if (existingSet.has(id)) continue;
        candidateMap.set(id, {
          id,
          name: el.name || '(unnamed)',
          type: el.type,
          alreadyInSandbox: false,
        });
      }
    }
    const candidates = Array.from(candidateMap.values()).sort(
      (a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)
    );
    const prevSelected = selectedIdsRef.current;
    const nextSelected = new Set<string>();
    for (const c of candidates) {
      if (c.alreadyInSandbox) continue;
      if (prevSelected.size === 0 || prevSelected.has(c.id)) nextSelected.add(c.id);
    }

    setPreview({ kind: 'related', byDepth: groups, candidates });
    setSelectedIds(nextSelected);
  }, [depth, direction, enabledElementTypesSet, enabledTypes, existingSet, isOpen, k, maxHops, mode, model, props]);

  // Auto-preview on open + whenever settings change, so the user does not have to click Preview manually.
  useEffect(() => {
    if (!isOpen) return;
    // Avoid flashing "Select at least one relationship type" while the open effect initializes.
    if (enabledTypes.length === 0) return;
    const t = window.setTimeout(() => {
      computePreview();
    }, 120);
    return () => window.clearTimeout(t);
  }, [computePreview, enabledTypes.length, isOpen]);

  const selectedCount = selectedIds.size;
  const candidatesCount = preview?.candidates.length ?? 0;
  const canInsert = preview !== null && selectedCount > 0 && enabledTypes.length > 0;

  const title = props.kind === 'related' ? 'Add related elements' : 'Insert intermediate elements';

  const maxNodes = props.maxNodes;
  const maxNewNodes = maxNodes ? Math.max(0, maxNodes - existingElementIds.length) : null;

  const candidateById = useMemo(() => {
    const m = new Map<string, Candidate>();
    for (const c of preview?.candidates ?? []) m.set(c.id, c);
    return m;
  }, [preview]);

  const visibleCandidateIds = useMemo(() => {
    if (!preview) return new Set<string>();
    const ids = new Set<string>();
    for (const c of preview.candidates) {
      if (!matchesCandidate({ c, q: search })) continue;
      ids.add(c.id);
    }
    return ids;
  }, [preview, search]);

  const selectedNewCount = useMemo(() => {
    if (!preview) return 0;
    let n = 0;
    for (const id of selectedIds) {
      const c = candidateById.get(id);
      if (c && !c.alreadyInSandbox) n++;
    }
    return n;
  }, [candidateById, preview, selectedIds]);

  const selectedVisibleCount = useMemo(() => {
    if (!preview) return 0;
    let n = 0;
    for (const id of selectedIds) {
      if (visibleCandidateIds.has(id)) n++;
    }
    return n;
  }, [preview, selectedIds, visibleCandidateIds]);

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

        <details
  style={{
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: 10,
  }}
>
  <summary style={{ cursor: 'pointer', fontSize: 12, opacity: 0.85 }}>Filters</summary>
  <div className="formGrid" style={{ marginTop: 10 }}>
    {props.kind === 'intermediates' ? (
      <div className="formRow">
        <label>Path options</label>
        <div className="sandboxInsertRow">
          <div className="sandboxInsertField sandboxInsertField--mode">
            <span className="crudHint" style={{ margin: 0 }}>
              Mode
            </span>
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

          {mode === 'topk' ? (
            <div className="sandboxInsertField sandboxInsertField--k">
              <span className="crudHint" style={{ margin: 0 }}>
                K
              </span>
              <input
                id="sandbox-insert-k"
                className="textInput"
                type="number"
                min={1}
                max={10}
                value={k}
                onChange={(e) => setK(Number(e.currentTarget.value))}
              />
            </div>
          ) : null}

          <div className="sandboxInsertField sandboxInsertField--maxHops">
            <span className="crudHint" style={{ margin: 0 }}>
              Max hops
            </span>
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

          <div className="sandboxInsertField sandboxInsertField--direction">
            <span className="crudHint" style={{ margin: 0 }}>
              Direction
            </span>
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
        </div>
      </div>
    ) : (
      <div className="formRow">
        <label>Filters</label>
        <div className="sandboxInsertRow">
          <div className="sandboxInsertField sandboxInsertField--depth">
            <span className="crudHint" style={{ margin: 0 }}>
              Depth
            </span>
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

          <div className="sandboxInsertField sandboxInsertField--direction">
            <span className="crudHint" style={{ margin: 0 }}>
              Direction
            </span>
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
        </div>
      </div>
    )}

    <div className="formRow">
      <label>Relationship types</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="miniLinkButton"
          onClick={() => setEnabledTypes(relationshipTypesForDialog)}
          disabled={relationshipTypesForDialog.length === 0}
          aria-disabled={relationshipTypesForDialog.length === 0}
        >
          All
        </button>
        <button
          type="button"
          className="miniLinkButton"
          onClick={() => setEnabledTypes([])}
          disabled={relationshipTypesForDialog.length === 0}
          aria-disabled={relationshipTypesForDialog.length === 0}
        >
          None
        </button>
        <span className="crudHint" style={{ margin: 0 }}>
          {enabledTypes.length}/{relationshipTypesForDialog.length}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6, marginTop: 6 }}>
        {relationshipTypesForDialog.map((t) => {
          const checked = enabledTypes.includes(t);
          return (
            <label key={t} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => setEnabledTypes((prev) => toggleString(prev, t))}
              />
              <span>{getRelationshipTypeLabel(t)}</span>
            </label>
          );
        })}
      </div>
    </div>

    <div className="formRow">
      <label>Element types</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="miniLinkButton"
          onClick={() => setEnabledElementTypes(allElementTypesForModel)}
          disabled={allElementTypesForModel.length === 0}
          aria-disabled={allElementTypesForModel.length === 0}
        >
          All
        </button>
        <button
          type="button"
          className="miniLinkButton"
          onClick={() => setEnabledElementTypes([])}
          disabled={allElementTypesForModel.length === 0}
          aria-disabled={allElementTypesForModel.length === 0}
        >
          None
        </button>
        <span className="crudHint" style={{ margin: 0 }}>
          {enabledElementTypes.length}/{allElementTypesForModel.length}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6, marginTop: 6 }}>
        {allElementTypesForModel.map((t) => {
          const checked = enabledElementTypes.includes(t);
          return (
            <label key={t} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => setEnabledElementTypes((prev) => toggleString(prev, t))}
              />
              <span>{getElementTypeLabel(t)}</span>
            </label>
          );
        })}
      </div>
    </div>
  </div>
</details>
      </div>

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
                  Candidates: {candidatesCount} (visible {visibleCandidateIds.size}) · Selected: {selectedCount}{' '}
                  (visible {selectedVisibleCount})
                </p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="miniLinkButton"
                    onClick={() => {
                      const next = new Set<string>(selectedIds);
                      for (const id of visibleCandidateIds) {
                        if (existingSet.has(id)) continue;
                        next.add(id);
                      }
                      setSelectedIds(next);
                    }}
                  >
                    Select all visible
                  </button>
                  <button
                    type="button"
                    className="miniLinkButton"
                    onClick={() => {
                      const next = new Set<string>(selectedIds);
                      for (const id of visibleCandidateIds) next.delete(id);
                      setSelectedIds(next);
                    }}
                  >
                    Clear visible
                  </button>
                  <button type="button" className="miniLinkButton" onClick={() => setSelectedIds(new Set())}>
                    Select none
                  </button>
                </div>
              </div>
              {maxNewNodes !== null && selectedNewCount > maxNewNodes ? (
                <p className="crudHint" style={{ margin: 0, marginTop: 6 }}>
                  Selection exceeds node cap: will add up to {maxNewNodes} new node(s).
                </p>
              ) : null}
            </div>

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
                          Path {idx + 1}: {p.path.length} node(s) · intermediates {p.intermediates.length} (new{' '}
                          {totalNew}, visible new {visibleNew})
                        </span>
                      </summary>

                      {visibleIntermediates.length ? (
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6, marginTop: 8 }}>
                          {visibleIntermediates.map((id) => {
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
                {preview.byDepth.map((g) => {
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
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6, marginTop: 8 }}>
                          {visibleIds.map((id) => {
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
    </Dialog>
  );
}

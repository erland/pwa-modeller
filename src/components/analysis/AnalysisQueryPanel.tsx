import { useEffect, useMemo, useState } from 'react';

import type {
  AnalysisDirection,
    ElementType,
  Element,
  Model,
  ModelKind,
  RelationshipType
} from '../../domain';
import { getElementTypeLabel } from '../../domain';
import { getAnalysisAdapter } from '../../analysis/adapters/registry';
import { ElementChooserDialog } from '../model/pickers/ElementChooserDialog';

export type AnalysisMode = 'related' | 'paths';

type Props = {
  model: Model;
  modelKind: ModelKind;
  mode: AnalysisMode;
  onChangeMode: (mode: AnalysisMode) => void;

  // -----------------------------
  // Filters (draft)
  // -----------------------------
  direction: AnalysisDirection;
  onChangeDirection: (dir: AnalysisDirection) => void;
  relationshipTypes: RelationshipType[];
  onChangeRelationshipTypes: (types: RelationshipType[]) => void;
  layers: string[];
  onChangeLayers: (layers: string[]) => void;

  // Related-only (refine within selected layers)
  elementTypes: ElementType[];
  onChangeElementTypes: (types: ElementType[]) => void;

  // Related-only
  maxDepth: number;
  onChangeMaxDepth: (n: number) => void;
  includeStart: boolean;
  onChangeIncludeStart: (v: boolean) => void;

  // Paths-only
  maxPaths: number;
  onChangeMaxPaths: (n: number) => void;
  maxPathLength: number | null;
  onChangeMaxPathLength: (n: number | null) => void;

  onApplyPreset: (presetId: 'upstream' | 'downstream' | 'crossLayerTrace' | 'clear') => void;

  draftStartId: string;
  onChangeDraftStartId: (id: string) => void;

  draftSourceId: string;
  onChangeDraftSourceId: (id: string) => void;

  draftTargetId: string;
  onChangeDraftTargetId: (id: string) => void;

  canUseSelection: boolean;
  onUseSelection: (which: 'start' | 'source' | 'target') => void;

  canRun: boolean;
  onRun: () => void;
};

// We keep filter option lists dynamic (derived from the loaded model) so that
// users working with a tailored meta-model don't see irrelevant ArchiMate options.

function getAvailableRelationshipTypes(model: Model): RelationshipType[] {
  const seen = new Set<RelationshipType>();
  for (const rel of Object.values(model.relationships)) {
    if (!rel?.type) continue;
    seen.add(rel.type);
  }
  return Array.from(seen).sort((a, b) => String(a).localeCompare(String(b)));
}

function collectFacetValues<T extends string>(model: Model, modelKind: ModelKind, facetId: string): T[] {
  const adapter = getAnalysisAdapter(modelKind);
  const seen = new Set<string>();
  for (const el of Object.values(model.elements)) {
    if (!el) continue;
    const v = adapter.getNodeFacetValues(el, model)[facetId];
    if (typeof v === 'string') {
      if (v) seen.add(v);
      continue;
    }
    if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === 'string' && item) seen.add(item);
      }
    }
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b)) as T[];
}

function collectFacetValuesConstrained<T extends string>(
  model: Model,
  modelKind: ModelKind,
  valueFacetId: string,
  constraintFacetId: string,
  allowedConstraints: readonly string[]
): T[] {
  if (!allowedConstraints.length) return [] as T[];
  const adapter = getAnalysisAdapter(modelKind);
  const allowed = new Set<string>(allowedConstraints);
  const seen = new Set<string>();

  for (const el of Object.values(model.elements)) {
    if (!el) continue;
    const facets = adapter.getNodeFacetValues(el, model);
    const constraintV = facets[constraintFacetId];
    let constraintMatch = false;
    if (typeof constraintV === 'string') {
      constraintMatch = allowed.has(constraintV);
    } else if (Array.isArray(constraintV)) {
      constraintMatch = constraintV.some((x) => typeof x === 'string' && allowed.has(x));
    }
    if (!constraintMatch) continue;

    const v = facets[valueFacetId];
    if (typeof v === 'string') {
      if (v) seen.add(v);
      continue;
    }
    if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === 'string' && item) seen.add(item);
      }
    }
  }

  return Array.from(seen).sort((a, b) => a.localeCompare(b)) as T[];
}

function toggle<T extends string>(arr: readonly T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

function dedupeSort(arr: readonly string[]): string[] {
  return Array.from(new Set(arr)).sort((a, b) => a.localeCompare(b));
}

function pruneToAllowed<T extends string>(selected: readonly T[], allowed: readonly T[]): T[] {
  const s = new Set<T>(allowed);
  const pruned = selected.filter((x) => s.has(x));
  return pruned.length === selected.length ? (selected as T[]) : pruned;
}

function labelForElement(e: Element): string {
  const type = e.type ? String(e.type) : 'Unknown';
  const layer = e.layer ? String(e.layer) : '';
  const suffix = layer ? ` (${type}, ${layer})` : ` (${type})`;
  return `${e.name || '(unnamed)'}${suffix}`;
}

export function AnalysisQueryPanel({
  model,
  modelKind,
  mode,
  onChangeMode,
  direction,
  onChangeDirection,
  relationshipTypes,
  onChangeRelationshipTypes,
  layers,
  onChangeLayers,
  elementTypes,
  onChangeElementTypes,
  maxDepth,
  onChangeMaxDepth,
  includeStart,
  onChangeIncludeStart,
  maxPaths,
  onChangeMaxPaths,
  maxPathLength,
  onChangeMaxPathLength,
  onApplyPreset,
  draftStartId,
  onChangeDraftStartId,
  draftSourceId,
  onChangeDraftSourceId,
  draftTargetId,
  onChangeDraftTargetId,
  canUseSelection,
  onUseSelection,
  canRun,
  onRun
}: Props) {
  const [chooser, setChooser] = useState<null | { which: 'start' | 'source' | 'target' }>(null);

  const modelName = model.metadata?.name || 'Model';

  const adapter = useMemo(() => getAnalysisAdapter(modelKind), [modelKind]);
  const facetDefinitions = useMemo(() => adapter.getFacetDefinitions(model), [adapter, model]);
  const hasLayerFacet = facetDefinitions.some((f) => f.id === 'archimateLayer');
  const hasElementTypeFacet = facetDefinitions.some((f) => f.id === 'elementType');

  const availableRelationshipTypes = useMemo(() => getAvailableRelationshipTypes(model), [model]);
  const availableLayers = useMemo(() => {
    if (!hasLayerFacet) return [] as string[];
    return collectFacetValues<string>(model, modelKind, 'archimateLayer');
  }, [hasLayerFacet, model, modelKind]);

  const relationshipTypeSetSize = availableRelationshipTypes.length;
  const layerSetSize = availableLayers.length;

  const relationshipTypesSorted = useMemo(
    () => dedupeSort(relationshipTypes) as RelationshipType[],
    [relationshipTypes]
  );

  const layersSorted = useMemo(
    () => dedupeSort(layers) as string[],
    [layers]
  );

  const allowedElementTypes = useMemo(() => {
    if (!hasElementTypeFacet) return [] as ElementType[];
    if (layersSorted.length === 0) return [] as ElementType[];
    const types = collectFacetValuesConstrained<ElementType>(
      model,
      modelKind,
      'elementType',
      'archimateLayer',
      layersSorted
    );
    types.sort((a, b) =>
      getElementTypeLabel(a).localeCompare(getElementTypeLabel(b), undefined, { sensitivity: 'base' })
    );
    return types;
  }, [hasElementTypeFacet, model, modelKind, layersSorted]);

  const elementTypesSorted = useMemo(
    () => dedupeSort(elementTypes) as ElementType[],
    [elementTypes]
  );

  // Prune selected filters when the loaded model changes.
  useEffect(() => {
    const pruned = pruneToAllowed(relationshipTypesSorted, availableRelationshipTypes);
    if (pruned !== relationshipTypesSorted) onChangeRelationshipTypes(pruned);
  }, [availableRelationshipTypes, onChangeRelationshipTypes, relationshipTypesSorted]);

  useEffect(() => {
    const pruned = pruneToAllowed(layersSorted, availableLayers);
    if (pruned !== layersSorted) onChangeLayers(pruned);
  }, [layersSorted, availableLayers, onChangeLayers]);

  useEffect(() => {
    if (mode !== 'related') return;
    const pruned = pruneToAllowed(elementTypesSorted, allowedElementTypes);
    if (pruned !== elementTypesSorted) onChangeElementTypes(pruned);
  }, [allowedElementTypes, elementTypesSorted, mode, onChangeElementTypes]);

  const hasAnyFilters =
    relationshipTypesSorted.length > 0 ||
    layersSorted.length > 0 ||
    (mode === 'related' && elementTypesSorted.length > 0) ||
    direction !== 'both' ||
    (mode === 'related' ? (maxDepth !== 4 || includeStart) : (maxPaths !== 10 || maxPathLength !== null));

  return (
    <section className="crudSection" aria-label="Analysis query">
      <div className="crudHeader">
        <div>
          <p className="crudTitle">Query</p>
          <p className="crudHint">Pick elements in “{modelName}” and run an analysis.</p>
        </div>

        <div className="toolbar" aria-label="Analysis query toolbar">
          <div className="toolbarGroup">
            <label htmlFor="analysis-mode">Analysis</label>
            <select
              id="analysis-mode"
              className="selectInput"
              value={mode}
              onChange={(e) => onChangeMode(e.currentTarget.value as AnalysisMode)}
            >
              <option value="related">Related elements</option>
              <option value="paths">Connection between two</option>
            </select>
          </div>

          {mode === 'related' ? (
            <div className="toolbarGroup">
              <label htmlFor="analysis-start">Start element</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  id="analysis-start"
                  className="textInput"
                  readOnly
                  value={draftStartId && model.elements[draftStartId] ? labelForElement(model.elements[draftStartId]) : ''}
                  placeholder="Select…"
                />
                <button type="button" className="shellButton secondary" onClick={() => setChooser({ which: 'start' })}>
                  Choose…
                </button>
                <button type="button" className="shellButton secondary" disabled={!draftStartId} onClick={() => onChangeDraftStartId('')}>
                  Clear
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button
                  type="button"
                  className="miniLinkButton"
                  disabled={!canUseSelection}
                  onClick={() => onUseSelection('start')}
                >
                  Use current selection
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="toolbarGroup">
                <label htmlFor="analysis-source">Source</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    id="analysis-source"
                    className="textInput"
                    readOnly
                    value={
                      draftSourceId && model.elements[draftSourceId] ? labelForElement(model.elements[draftSourceId]) : ''
                    }
                    placeholder="Select…"
                  />
                  <button type="button" className="shellButton secondary" onClick={() => setChooser({ which: 'source' })}>
                    Choose…
                  </button>
                  <button type="button" className="shellButton secondary" disabled={!draftSourceId} onClick={() => onChangeDraftSourceId('')}>
                    Clear
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <button
                    type="button"
                    className="miniLinkButton"
                    disabled={!canUseSelection}
                    onClick={() => onUseSelection('source')}
                  >
                    Use current selection
                  </button>
                </div>
              </div>

              <div className="toolbarGroup">
                <label htmlFor="analysis-target">Target</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    id="analysis-target"
                    className="textInput"
                    readOnly
                    value={
                      draftTargetId && model.elements[draftTargetId] ? labelForElement(model.elements[draftTargetId]) : ''
                    }
                    placeholder="Select…"
                  />
                  <button type="button" className="shellButton secondary" onClick={() => setChooser({ which: 'target' })}>
                    Choose…
                  </button>
                  <button type="button" className="shellButton secondary" disabled={!draftTargetId} onClick={() => onChangeDraftTargetId('')}>
                    Clear
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <button
                    type="button"
                    className="miniLinkButton"
                    disabled={!canUseSelection}
                    onClick={() => onUseSelection('target')}
                  >
                    Use current selection
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="toolbarGroup" style={{ minWidth: 0 }}>
            <label style={{ visibility: 'hidden' }} aria-hidden="true">
              Run
            </label>
            <button type="button" className="shellButton" disabled={!canRun} onClick={onRun}>
              Run analysis
            </button>
          </div>
        </div>
      </div>

      <details style={{ marginTop: 10 }}>
        <summary style={{ cursor: 'pointer', fontSize: 12, opacity: 0.9 }}>
          Filters & presets{hasAnyFilters ? ' (active)' : ''}
        </summary>

        <div className="toolbar" style={{ marginTop: 10 }} aria-label="Analysis filters">
          <div className="toolbarGroup">
            <label htmlFor="analysis-direction">Direction</label>
            <select
              id="analysis-direction"
              className="selectInput"
              value={direction}
              onChange={(e) => onChangeDirection(e.currentTarget.value as AnalysisDirection)}
            >
              <option value="both">Both</option>
              <option value="outgoing">Downstream (outgoing)</option>
              <option value="incoming">Upstream (incoming)</option>
            </select>
          </div>

          {mode === 'related' ? (
            <>
              <div className="toolbarGroup">
                <label htmlFor="analysis-maxDepth">Max depth</label>
                <select
                  id="analysis-maxDepth"
                  className="selectInput"
                  value={String(maxDepth)}
                  onChange={(e) => onChangeMaxDepth(Number(e.currentTarget.value))}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <option key={n} value={String(n)}>
                      {n}
                    </option>
                  ))}
                </select>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.85 }}>
                  <input
                    type="checkbox"
                    checked={includeStart}
                    onChange={(e) => onChangeIncludeStart(e.currentTarget.checked)}
                  />
                  Include start element
                </label>
              </div>
            </>
          ) : (
            <>
              <div className="toolbarGroup">
                <label htmlFor="analysis-maxPaths">Max paths</label>
                <select
                  id="analysis-maxPaths"
                  className="selectInput"
                  value={String(maxPaths)}
                  onChange={(e) => onChangeMaxPaths(Number(e.currentTarget.value))}
                >
                  {[1, 2, 3, 5, 10, 15, 20, 30, 50].map((n) => (
                    <option key={n} value={String(n)}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>

              <div className="toolbarGroup">
                <label htmlFor="analysis-maxPathLength">Max path length</label>
                <select
                  id="analysis-maxPathLength"
                  className="selectInput"
                  value={maxPathLength === null ? '' : String(maxPathLength)}
                  onChange={(e) => {
                    const v = e.currentTarget.value;
                    onChangeMaxPathLength(v ? Number(v) : null);
                  }}
                >
                  <option value="">Auto (shortest only)</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15].map((n) => (
                    <option key={n} value={String(n)}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div className="toolbarGroup" style={{ minWidth: 260 }}>
            <label>Relationship types ({relationshipTypesSorted.length}/{relationshipTypeSetSize})</label>
            <div
              style={{
                maxHeight: 140,
                overflow: 'auto',
                border: '1px solid var(--border-1)',
                borderRadius: 10,
                padding: '8px 10px',
                background: 'rgba(255,255,255,0.02)'
              }}
            >
              {availableRelationshipTypes.length === 0 ? (
                <p className="crudHint" style={{ margin: 0 }}>
                  No relationships in the model.
                </p>
              ) : (
                availableRelationshipTypes.map((t) => (
                  <label
                    key={t}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.9, marginBottom: 6 }}
                  >
                    <input
                      type="checkbox"
                      checked={relationshipTypesSorted.includes(t)}
                      onChange={() =>
                        onChangeRelationshipTypes(
                          dedupeSort(toggle(relationshipTypesSorted, t)) as RelationshipType[]
                        )
                      }
                    />
                    <span className="mono">{String(t)}</span>
                  </label>
                ))
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="miniLinkButton"
                onClick={() =>
                  onChangeRelationshipTypes(availableRelationshipTypes.filter((t) => t !== 'Unknown'))
                }
                disabled={availableRelationshipTypes.length === 0}
              >
                All
              </button>
              <button type="button" className="miniLinkButton" onClick={() => onChangeRelationshipTypes([])}>
                None
              </button>
            </div>
          </div>

          {hasLayerFacet ? (
            <div className="toolbarGroup" style={{ minWidth: 260 }}>
              <label>Layers ({layersSorted.length}/{layerSetSize})</label>
              <div
                style={{
                  maxHeight: 140,
                  overflow: 'auto',
                  border: '1px solid var(--border-1)',
                  borderRadius: 10,
                  padding: '8px 10px',
                  background: 'rgba(255,255,255,0.02)'
                }}
              >
                {availableLayers.length === 0 ? (
                  <p className="crudHint" style={{ margin: 0 }}>
                    No ArchiMate layers found in the model.
                  </p>
                ) : (
                  availableLayers.map((l) => (
                    <label
                      key={l}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.9, marginBottom: 6 }}
                    >
                      <input
                        type="checkbox"
                        checked={layersSorted.includes(l)}
                        onChange={() =>
                          onChangeLayers(
                            dedupeSort(toggle(layersSorted, l)) as string[]
                          )
                        }
                      />
                      {String(l)}
                    </label>
                  ))
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="miniLinkButton"
                  onClick={() => onChangeLayers(availableLayers)}
                  disabled={availableLayers.length === 0}
                >
                  All
                </button>
                <button type="button" className="miniLinkButton" onClick={() => onChangeLayers([])}>
                  None
                </button>
              </div>
            </div>
          ) : null}

          {mode === 'related' && hasElementTypeFacet && layersSorted.length > 0 ? (
            <div className="toolbarGroup" style={{ minWidth: 260 }}>
              <label>
                Element types ({elementTypesSorted.length}/{allowedElementTypes.length})
              </label>
              <div
                style={{
                  maxHeight: 180,
                  overflow: 'auto',
                  border: '1px solid var(--border-1)',
                  borderRadius: 10,
                  padding: '8px 10px',
                  background: 'rgba(255,255,255,0.02)'
                }}
              >
                {allowedElementTypes.length === 0 ? (
                  <p className="crudHint" style={{ margin: 0 }}>
                    No element types found in the selected layer(s).
                  </p>
                ) : (
                  allowedElementTypes.map((t) => (
                    <label
                      key={t}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 12,
                        opacity: 0.9,
                        marginBottom: 6
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={elementTypesSorted.includes(t)}
                        onChange={() =>
                          onChangeElementTypes(
                            dedupeSort(toggle(elementTypesSorted, t)) as ElementType[]
                          )
                        }
                      />
                      <span className="mono">{getElementTypeLabel(t)}</span>
                    </label>
                  ))
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="miniLinkButton"
                  onClick={() => onChangeElementTypes(allowedElementTypes)}
                  disabled={allowedElementTypes.length === 0}
                >
                  All
                </button>
                <button type="button" className="miniLinkButton" onClick={() => onChangeElementTypes([])}>
                  None
                </button>
              </div>
              <p className="crudHint" style={{ marginTop: 8 }}>
                Options are limited to the selected layer(s) and what exists in the model.
              </p>
            </div>
          ) : null}

          <div className="toolbarGroup" style={{ minWidth: 220 }}>
            <label>Presets</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="miniLinkButton" onClick={() => onApplyPreset('upstream')}>
                Upstream
              </button>
              <button type="button" className="miniLinkButton" onClick={() => onApplyPreset('downstream')}>
                Downstream
              </button>
              <button type="button" className="miniLinkButton" onClick={() => onApplyPreset('crossLayerTrace')}>
                Business→App→Tech
              </button>
              <button type="button" className="miniLinkButton" onClick={() => onApplyPreset('clear')}>
                Clear
              </button>
            </div>
            <p className="crudHint" style={{ marginTop: 8 }}>
              Presets set filters; use “Run analysis” to refresh element selection if needed.
            </p>
          </div>
        </div>
      </details>

      <ElementChooserDialog
        title={
          chooser?.which === 'start'
            ? 'Choose start element'
            : chooser?.which === 'source'
              ? 'Choose source element'
              : chooser?.which === 'target'
                ? 'Choose target element'
                : 'Choose element'
        }
        isOpen={!!chooser}
        model={model}
        value={
          chooser?.which === 'start'
            ? draftStartId
            : chooser?.which === 'source'
              ? draftSourceId
              : chooser?.which === 'target'
                ? draftTargetId
                : ''
        }
        onClose={() => setChooser(null)}
        onChoose={(id) => {
          if (chooser?.which === 'start') onChangeDraftStartId(id);
          else if (chooser?.which === 'source') onChangeDraftSourceId(id);
          else if (chooser?.which === 'target') onChangeDraftTargetId(id);
          setChooser(null);
        }}
      />
    </section>
  );
}

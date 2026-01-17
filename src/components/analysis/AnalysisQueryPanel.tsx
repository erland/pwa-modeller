import { useMemo } from 'react';

import type {
  AnalysisDirection,
  ArchimateLayer,
  ElementType,
  Element,
  Model,
  RelationshipType
} from '../../domain';
import { ELEMENT_TYPES_BY_LAYER, getElementTypeLabel } from '../../domain';

export type AnalysisMode = 'related' | 'paths';

type Props = {
  model: Model;
  elements: Element[];
  mode: AnalysisMode;
  onChangeMode: (mode: AnalysisMode) => void;

  // -----------------------------
  // Filters (draft)
  // -----------------------------
  direction: AnalysisDirection;
  onChangeDirection: (dir: AnalysisDirection) => void;
  relationshipTypes: RelationshipType[];
  onChangeRelationshipTypes: (types: RelationshipType[]) => void;
  archimateLayers: ArchimateLayer[];
  onChangeArchimateLayers: (layers: ArchimateLayer[]) => void;

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

const ARCHIMATE_LAYER_OPTIONS: ArchimateLayer[] = [
  'Strategy',
  'Business',
  'Application',
  'Technology',
  'Physical',
  'ImplementationMigration',
  'Motivation'
];

const RELATIONSHIP_TYPE_OPTIONS: RelationshipType[] = [
  'Association',
  'Realization',
  'Serving',
  'Flow',
  'Composition',
  'Aggregation',
  'Assignment',
  'Access',
  'Influence',
  'Triggering',
  'Specialization',
  'Unknown'
];

function elementTypesForLayers(layers: readonly ArchimateLayer[]): ElementType[] {
  const out: ElementType[] = [];
  const seen = new Set<ElementType>();
  for (const layer of layers) {
    for (const t of ELEMENT_TYPES_BY_LAYER[layer] ?? []) {
      if (seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
  }
  out.sort((a, b) => getElementTypeLabel(a).localeCompare(getElementTypeLabel(b), undefined, { sensitivity: 'base' }));
  return out;
}

function toggle<T extends string>(arr: readonly T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

function dedupeSort(arr: readonly string[]): string[] {
  return Array.from(new Set(arr)).sort((a, b) => a.localeCompare(b));
}

function labelForElement(e: Element): string {
  const type = e.type ? String(e.type) : 'Unknown';
  const layer = e.layer ? String(e.layer) : '';
  const suffix = layer ? ` (${type}, ${layer})` : ` (${type})`;
  return `${e.name || '(unnamed)'}${suffix}`;
}

export function AnalysisQueryPanel({
  model,
  elements,
  mode,
  onChangeMode,
  direction,
  onChangeDirection,
  relationshipTypes,
  onChangeRelationshipTypes,
  archimateLayers,
  onChangeArchimateLayers,
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
  const options = useMemo(() => {
    // Keep deterministic order, but build labels once.
    return elements.map((e) => ({ id: e.id, label: labelForElement(e) }));
  }, [elements]);

  const modelName = model.metadata?.name || 'Model';

  const relationshipTypeSetSize = RELATIONSHIP_TYPE_OPTIONS.length;
  const layerSetSize = ARCHIMATE_LAYER_OPTIONS.length;

  const relationshipTypesSorted = useMemo(
    () => dedupeSort(relationshipTypes) as RelationshipType[],
    [relationshipTypes]
  );

  const archimateLayersSorted = useMemo(
    () => dedupeSort(archimateLayers) as ArchimateLayer[],
    [archimateLayers]
  );

  const allowedElementTypes = useMemo(() => {
    if (archimateLayersSorted.length === 0) return [] as ElementType[];
    return elementTypesForLayers(archimateLayersSorted);
  }, [archimateLayersSorted]);

  const elementTypesSorted = useMemo(
    () => dedupeSort(elementTypes) as ElementType[],
    [elementTypes]
  );

  const hasAnyFilters =
    relationshipTypesSorted.length > 0 ||
    archimateLayersSorted.length > 0 ||
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
              <select
                id="analysis-start"
                className="selectInput"
                value={draftStartId}
                onChange={(e) => onChangeDraftStartId(e.currentTarget.value)}
              >
                <option value="">Select…</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
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
                <select
                  id="analysis-source"
                  className="selectInput"
                  value={draftSourceId}
                  onChange={(e) => onChangeDraftSourceId(e.currentTarget.value)}
                >
                  <option value="">Select…</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
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
                <select
                  id="analysis-target"
                  className="selectInput"
                  value={draftTargetId}
                  onChange={(e) => onChangeDraftTargetId(e.currentTarget.value)}
                >
                  <option value="">Select…</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
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
              {RELATIONSHIP_TYPE_OPTIONS.map((t) => (
                <label
                  key={t}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.9, marginBottom: 6 }}
                >
                  <input
                    type="checkbox"
                    checked={relationshipTypesSorted.includes(t)}
                    onChange={() => onChangeRelationshipTypes(dedupeSort(toggle(relationshipTypesSorted, t)) as RelationshipType[])}
                  />
                  <span className="mono">{String(t)}</span>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="miniLinkButton"
                onClick={() => onChangeRelationshipTypes(RELATIONSHIP_TYPE_OPTIONS.filter((t) => t !== 'Unknown'))}
              >
                All
              </button>
              <button type="button" className="miniLinkButton" onClick={() => onChangeRelationshipTypes([])}>
                None
              </button>
            </div>
          </div>

          <div className="toolbarGroup" style={{ minWidth: 260 }}>
            <label>Layers ({archimateLayersSorted.length}/{layerSetSize})</label>
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
              {ARCHIMATE_LAYER_OPTIONS.map((l) => (
                <label
                  key={l}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.9, marginBottom: 6 }}
                >
                  <input
                    type="checkbox"
                    checked={archimateLayersSorted.includes(l)}
                    onChange={() => onChangeArchimateLayers(dedupeSort(toggle(archimateLayersSorted, l)) as ArchimateLayer[])}
                  />
                  {String(l)}
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <button type="button" className="miniLinkButton" onClick={() => onChangeArchimateLayers(ARCHIMATE_LAYER_OPTIONS)}>
                All
              </button>
              <button type="button" className="miniLinkButton" onClick={() => onChangeArchimateLayers([])}>
                None
              </button>
            </div>
          </div>

          {mode === 'related' && archimateLayersSorted.length > 0 ? (
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
                {allowedElementTypes.map((t) => (
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
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="miniLinkButton"
                  onClick={() => onChangeElementTypes(allowedElementTypes)}
                >
                  All
                </button>
                <button type="button" className="miniLinkButton" onClick={() => onChangeElementTypes([])}>
                  None
                </button>
              </div>
              <p className="crudHint" style={{ marginTop: 8 }}>
                Options are limited to the selected layer(s).
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
    </section>
  );
}

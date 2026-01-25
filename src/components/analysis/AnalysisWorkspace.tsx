import { useEffect, useMemo, useState } from 'react';

import type { AnalysisDirection, ElementType, ModelKind, RelationshipType } from '../../domain';
import type { Selection } from '../model/selection';
import { useModelStore, useAnalysisPathsBetween, useAnalysisRelatedElements } from '../../store';

import '../../styles/crud.css';

import { AnalysisQueryPanel, type AnalysisMode } from './AnalysisQueryPanel';
import { AnalysisResultTable } from './AnalysisResultTable';
import { TraceabilityExplorer } from './TraceabilityExplorer';
import { getAnalysisAdapter } from '../../analysis/adapters/registry';
import { buildRelationshipMatrix, type RelationshipMatrixDirection } from '../../domain/analysis/relationshipMatrix';
import { RelationshipMatrixTable } from './RelationshipMatrixTable';
import { RelationshipMatrixCellDialog } from './RelationshipMatrixCellDialog';

function selectionToElementId(sel: Selection): string | null {
  switch (sel.kind) {
    case 'element':
      return sel.elementId;
    case 'viewNode':
      return sel.elementId;
    case 'viewNodes':
      return sel.elementIds[0] ?? null;
    case 'relationship':
      // For now we don't map relationship -> endpoint; Step 4+ can add this if desired.
      return null;
    default:
      return null;
  }
}

function selectionToElementIds(sel: Selection): string[] {
  switch (sel.kind) {
    case 'element':
      return [sel.elementId];
    case 'viewNode':
      return [sel.elementId];
    case 'viewNodes':
      return sel.elementIds;
    default:
      return [];
  }
}

export function AnalysisWorkspace({
  modelKind,
  selection,
  onSelect
}: {
  modelKind: ModelKind;
  selection: Selection;
  onSelect: (sel: Selection) => void;
}) {
  const model = useModelStore((s) => s.model);

  const [mode, setMode] = useState<AnalysisMode>('related');

  // -----------------------------
  // Matrix (draft)
  // -----------------------------
  const [matrixRowSource, setMatrixRowSource] = useState<'facet' | 'selection'>('facet');
  const [matrixRowElementType, setMatrixRowElementType] = useState<ElementType | ''>('');
  const [matrixRowLayer, setMatrixRowLayer] = useState<string | ''>('');
  const [matrixRowSelectionIds, setMatrixRowSelectionIds] = useState<string[]>([]);

  const [matrixColSource, setMatrixColSource] = useState<'facet' | 'selection'>('facet');
  const [matrixColElementType, setMatrixColElementType] = useState<ElementType | ''>('');
  const [matrixColLayer, setMatrixColLayer] = useState<string | ''>('');
  const [matrixColSelectionIds, setMatrixColSelectionIds] = useState<string[]>([]);

  const [matrixBuildNonce, setMatrixBuildNonce] = useState<number>(0);

  const [matrixBuiltQuery, setMatrixBuiltQuery] = useState<{
    rowIds: string[];
    colIds: string[];
    relationshipTypes: RelationshipType[];
    direction: RelationshipMatrixDirection;
  } | null>(null);

  const [matrixHighlightMissing, setMatrixHighlightMissing] = useState<boolean>(true);

  const [matrixCellDialog, setMatrixCellDialog] = useState<{
    rowId: string;
    rowLabel: string;
    colId: string;
    colLabel: string;
    relationshipIds: string[];
  } | null>(null);


  // -----------------------------
  // Filters (draft)
  // -----------------------------
  const [direction, setDirection] = useState<AnalysisDirection>('both');
  const [relationshipTypes, setRelationshipTypes] = useState<RelationshipType[]>([]);
  const [layers, setLayers] = useState<string[]>([]);
  const [elementTypes, setElementTypes] = useState<ElementType[]>([]);

  // Related-only
  const [maxDepth, setMaxDepth] = useState<number>(4);

  // Traceability: default to 1-hop expansion when entering explorer mode.
  useEffect(() => {
    if (mode !== 'traceability') return;
    // Only auto-adjust when still at the global default (4) to avoid overriding user intent.
    if (maxDepth === 4) setMaxDepth(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  const [includeStart, setIncludeStart] = useState<boolean>(false);

  // Paths-only
  const [maxPaths, setMaxPaths] = useState<number>(10);
  const [maxPathLength, setMaxPathLength] = useState<number | null>(null);

  // Draft inputs (user edits these).
  const [draftStartId, setDraftStartId] = useState<string>('');
  const [draftSourceId, setDraftSourceId] = useState<string>('');
  const [draftTargetId, setDraftTargetId] = useState<string>('');

  // Active ids (used for the current computed result).
  const [activeStartId, setActiveStartId] = useState<string>('');
  const [activeSourceId, setActiveSourceId] = useState<string>('');
  const [activeTargetId, setActiveTargetId] = useState<string>('');

  // If the user has an element selected and the draft is empty, prefill to reduce friction.
  useEffect(() => {
    const picked = selectionToElementId(selection);
    if (!picked) return;

    if (mode !== 'paths' && mode !== 'matrix') {
      if (!draftStartId) setDraftStartId(picked);
      return;
    }
    if (mode === 'paths') {
      if (!draftSourceId) setDraftSourceId(picked);
      else if (!draftTargetId && draftSourceId !== picked) setDraftTargetId(picked);
    }
  }, [selection, mode, draftStartId, draftSourceId, draftTargetId]);

  const relatedOpts = useMemo(
    () => ({
      direction,
      maxDepth,
      includeStart,
      relationshipTypes: relationshipTypes.length ? relationshipTypes : undefined,
              layers: layers.length ? layers : undefined,
      elementTypes: elementTypes.length ? elementTypes : undefined
    }),
    [direction, maxDepth, includeStart, relationshipTypes, layers, elementTypes]
  );

  const pathsOpts = useMemo(
    () => ({
      direction,
      maxPaths,
      maxPathLength: maxPathLength === null ? undefined : maxPathLength,
      relationshipTypes: relationshipTypes.length ? relationshipTypes : undefined,
              layers: layers.length ? layers : undefined,
      elementTypes: elementTypes.length ? elementTypes : undefined
    }),
    [direction, maxPaths, maxPathLength, relationshipTypes, layers, elementTypes]
  );

  // Results are driven by active element selection + *draft* filters (QoL).
  const relatedResult = useAnalysisRelatedElements(activeStartId || null, relatedOpts);
  const pathsResult = useAnalysisPathsBetween(activeSourceId || null, activeTargetId || null, pathsOpts);

  const selectionElementIds = useMemo(() => selectionToElementIds(selection), [selection]);

  const resolveMatrixFacetIds = useMemo(() => {
    if (!model) return { rowIds: [] as string[], colIds: [] as string[] };
    const adapter = getAnalysisAdapter(modelKind);
    const rowLayer = matrixRowLayer || null;
    const colLayer = matrixColLayer || null;

    const rowType = matrixRowElementType || null;
    const colType = matrixColElementType || null;

    const rowIds: string[] = [];
    const colIds: string[] = [];

    for (const el of Object.values(model.elements ?? {})) {
      if (!el?.id) continue;
      const facets = adapter.getNodeFacetValues(el, model);
      const typeV = facets.elementType;
      const layerV = facets.archimateLayer;

      const matches = (
        wantedType: string | null,
        wantedLayer: string | null
      ): boolean => {
        if (wantedType) {
          if (typeof typeV !== 'string' || typeV !== wantedType) return false;
        }
        if (wantedLayer) {
          if (typeof layerV === 'string') {
            if (layerV !== wantedLayer) return false;
          } else if (Array.isArray(layerV)) {
            if (!layerV.includes(wantedLayer)) return false;
          } else {
            return false;
          }
        }
        return true;
      };

      if (matches(rowType, rowLayer)) rowIds.push(el.id);
      if (matches(colType, colLayer)) colIds.push(el.id);
    }

    return { rowIds, colIds };
  }, [model, modelKind, matrixRowElementType, matrixRowLayer, matrixColElementType, matrixColLayer]);

  const matrixRowIds = matrixRowSource === 'selection' ? matrixRowSelectionIds : resolveMatrixFacetIds.rowIds;
  const matrixColIds = matrixColSource === 'selection' ? matrixColSelectionIds : resolveMatrixFacetIds.colIds;

  const matrixResult = useMemo(() => {
    if (!model || !matrixBuiltQuery) return null;
    return buildRelationshipMatrix(
      model,
      matrixBuiltQuery.rowIds,
      matrixBuiltQuery.colIds,
      { relationshipTypes: matrixBuiltQuery.relationshipTypes, direction: matrixBuiltQuery.direction },
      { includeSelf: false }
    );
  }, [model, matrixBuiltQuery]);

  const canRun = Boolean(
    model &&
      (mode === 'matrix'
        ? matrixRowIds.length > 0 && matrixColIds.length > 0
        : mode !== 'paths'
          ? draftStartId
          : draftSourceId && draftTargetId && draftSourceId !== draftTargetId)
  );

  function run() {
    if (!model) return;
    if (mode === 'matrix') {
      const matrixDirection: RelationshipMatrixDirection =
        direction === 'outgoing' ? 'rowToCol' : direction === 'incoming' ? 'colToRow' : 'both';

      setMatrixBuiltQuery({
        rowIds: [...matrixRowIds],
        colIds: [...matrixColIds],
        relationshipTypes: [...relationshipTypes],
        direction: matrixDirection,
      });

      // Bump nonce to make it obvious in UI when a new build occurred.
      setMatrixBuildNonce((n) => n + 1);
      return;
    }
    if (mode !== 'paths') {
      setActiveStartId(draftStartId);
      return;
    }
    setActiveSourceId(draftSourceId);
    setActiveTargetId(draftTargetId);
  }

  function applyPreset(presetId: 'upstream' | 'downstream' | 'crossLayerTrace' | 'clear') {
    if (presetId === 'clear') {
      setDirection('both');
      setRelationshipTypes([]);
      setLayers([]);
      setElementTypes([]);
      setMaxDepth(4);
      setIncludeStart(false);
      setMaxPaths(10);
      setMaxPathLength(null);
      setMatrixRowSource('facet');
      setMatrixRowElementType('');
      setMatrixRowLayer('');
      setMatrixRowSelectionIds([]);
      setMatrixColSource('facet');
      setMatrixColElementType('');
      setMatrixColLayer('');
      setMatrixColSelectionIds([]);
      return;
    }

    if (presetId === 'upstream') {
      setDirection('incoming');
      setMaxDepth(3);
      setMaxPaths(10);
      setMaxPathLength(null);
      return;
    }

    if (presetId === 'downstream') {
      setDirection('outgoing');
      setMaxDepth(3);
      setMaxPaths(10);
      setMaxPathLength(null);
      return;
    }

    // crossLayerTrace: Business → Application → Technology
    setDirection('both');
    setMaxDepth(4);
    setLayers(['Business', 'Application', 'Technology']);
    setElementTypes([]);
    setRelationshipTypes(['Realization', 'Serving', 'Assignment', 'Access', 'Flow', 'Association']);
    setMaxPaths(10);
    setMaxPathLength(null);
  }

  function useSelectionAs(which: 'start' | 'source' | 'target') {
    const picked = selectionToElementId(selection);
    if (!picked) return;
    if (which === 'start') setDraftStartId(picked);
    if (which === 'source') setDraftSourceId(picked);
    if (which === 'target') setDraftTargetId(picked);
  }

  const captureSelectionAsMatrixRows = () => {
    const picked = selectionToElementIds(selection);
    setMatrixRowSource('selection');
    setMatrixRowSelectionIds(picked);
  };

  const captureSelectionAsMatrixCols = () => {
    const picked = selectionToElementIds(selection);
    setMatrixColSource('selection');
    setMatrixColSelectionIds(picked);
  };

  const openTraceabilityFrom = (elementId: string) => {
    setMode('traceability');
    setDraftStartId(elementId);
    setActiveStartId(elementId);
  };

  const traceSeedId = activeStartId || draftStartId || selectionToElementId(selection) || '';
  return (
    <div className="workspace" aria-label="Analysis workspace">
      <div className="workspaceHeader">
        <h1 className="workspaceTitle">Analysis</h1>
        <div className="workspaceTabs" role="tablist" aria-label="Analysis tabs">
          <button
            type="button"
            className={`tabButton ${mode === 'related' ? 'isActive' : ''}`}
            role="tab"
            aria-selected={mode === 'related'}
            onClick={() => setMode('related')}
          >
            Related elements
          </button>
          <button
            type="button"
            className={`tabButton ${mode === 'paths' ? 'isActive' : ''}`}
            role="tab"
            aria-selected={mode === 'paths'}
            onClick={() => setMode('paths')}
          >
            Connection between two
          </button>
          <button
            type="button"
            className={`tabButton ${mode === 'traceability' ? 'isActive' : ''}`}
            role="tab"
            aria-selected={mode === 'traceability'}
            onClick={() => setMode('traceability')}
          >
            Traceability explorer
          </button>
          <button
            type="button"
            className={`tabButton ${mode === 'matrix' ? 'isActive' : ''}`}
            role="tab"
            aria-selected={mode === 'matrix'}
            onClick={() => setMode('matrix')}
          >
            Matrix
          </button>
        </div>
        <div className="rowActions">
          <button
            type="button"
            className="miniLinkButton"
            onClick={() => {
              const picked = selectionToElementId(selection);
              if (picked) openTraceabilityFrom(picked);
            }}
            disabled={!selectionToElementId(selection)}
            aria-disabled={!selectionToElementId(selection)}
            title="Open Traceability Explorer from the currently selected element"
          >
            Open traceability
          </button>
        </div>
      </div>

      {!model ? (
        <div className="crudSection" style={{ marginTop: 14 }}>
          <div className="crudHeader">
            <div>
              <p className="crudTitle">No model loaded</p>
              <p className="crudHint">Create or open a model to run analyses.</p>
            </div>
          </div>
        </div>
      ) : (
        <>
          <AnalysisQueryPanel
            model={model}
            modelKind={modelKind}
            mode={mode}
            onChangeMode={setMode}

            selectionElementIds={selectionElementIds}
            matrixRowSource={matrixRowSource}
            onChangeMatrixRowSource={setMatrixRowSource}
            matrixRowElementType={matrixRowElementType}
            onChangeMatrixRowElementType={setMatrixRowElementType}
            matrixRowLayer={matrixRowLayer}
            onChangeMatrixRowLayer={setMatrixRowLayer}
            matrixRowSelectionIds={matrixRowSelectionIds}
            onCaptureMatrixRowSelection={captureSelectionAsMatrixRows}

            matrixColSource={matrixColSource}
            onChangeMatrixColSource={setMatrixColSource}
            matrixColElementType={matrixColElementType}
            onChangeMatrixColElementType={setMatrixColElementType}
            matrixColLayer={matrixColLayer}
            onChangeMatrixColLayer={setMatrixColLayer}
            matrixColSelectionIds={matrixColSelectionIds}
            onCaptureMatrixColSelection={captureSelectionAsMatrixCols}

            direction={direction}
            onChangeDirection={setDirection}
            relationshipTypes={relationshipTypes}
            onChangeRelationshipTypes={setRelationshipTypes}
            layers={layers}
            onChangeLayers={setLayers}
            elementTypes={elementTypes}
            onChangeElementTypes={setElementTypes}
            maxDepth={maxDepth}
            onChangeMaxDepth={setMaxDepth}
            includeStart={includeStart}
            onChangeIncludeStart={setIncludeStart}
            maxPaths={maxPaths}
            onChangeMaxPaths={setMaxPaths}
            maxPathLength={maxPathLength}
            onChangeMaxPathLength={setMaxPathLength}
            onApplyPreset={applyPreset}
            draftStartId={draftStartId}
            onChangeDraftStartId={setDraftStartId}
            draftSourceId={draftSourceId}
            onChangeDraftSourceId={setDraftSourceId}
            draftTargetId={draftTargetId}
            onChangeDraftTargetId={setDraftTargetId}
            onUseSelection={useSelectionAs}
            canUseSelection={Boolean(selectionToElementId(selection))}
            canRun={canRun}
            onRun={run}
          />

          {mode === 'matrix' ? (
            <>
              <div className="crudSection" style={{ marginTop: 14 }}>
                <div className="crudHeader">
                  <div>
                    <p className="crudTitle">Matrix query</p>
                    <p className="crudHint">
                      Rows: <span className="mono">{matrixRowIds.length}</span>, Columns: <span className="mono">{matrixColIds.length}</span>.
                      Click “Build matrix” to compute the table.
                    </p>
                    {matrixBuiltQuery ? (
                      <p className="crudHint" style={{ marginTop: 8 }}>
                        Last build: <span className="mono">{matrixBuildNonce}</span>
                      </p>
                    ) : (
                      <p className="crudHint" style={{ marginTop: 8 }}>
                        No matrix built yet.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {matrixResult ? (
                <RelationshipMatrixTable
                  result={matrixResult}
                  highlightMissing={matrixHighlightMissing}
                  onToggleHighlightMissing={() => setMatrixHighlightMissing((v) => !v)}
                  onOpenCell={(info) => setMatrixCellDialog(info)}
                />
              ) : null}

              {matrixResult && model && matrixCellDialog ? (
                <RelationshipMatrixCellDialog
                  isOpen={Boolean(matrixCellDialog)}
                  onClose={() => setMatrixCellDialog(null)}
                  model={model}
                  cell={matrixCellDialog}
                />
              ) : null}
            </>
          ) : mode === 'traceability' ? (
            traceSeedId ? (
              <TraceabilityExplorer
                model={model}
                modelKind={modelKind}
                seedId={traceSeedId}
                direction={direction}
                relationshipTypes={relationshipTypes}
                layers={layers}
                elementTypes={elementTypes}
                expandDepth={maxDepth}
                onSelectElement={(elementId) => onSelect({ kind: 'element', elementId })}
                onSelectRelationship={(relationshipId) => onSelect({ kind: 'relationship', relationshipId })}
              />
            ) : (
              <div className="crudSection" style={{ marginTop: 14 }}>
                <div className="crudHeader">
                  <div>
                    <p className="crudTitle">No start element</p>
                    <p className="crudHint">
                      Pick a start element in the Query panel (or select an element in the model) and click Run analysis.
                    </p>
                  </div>
                </div>
              </div>
            )
          ) : (
            <AnalysisResultTable
              model={model}
              modelKind={modelKind}
              mode={mode}
              relatedResult={relatedResult}
              pathsResult={pathsResult}
              selection={selection}
              onSelectRelationship={(relationshipId) => onSelect({ kind: 'relationship', relationshipId })}
              onSelectElement={(elementId) => onSelect({ kind: 'element', elementId })}
              onOpenTraceability={(elementId) => openTraceabilityFrom(elementId)}
            />
          )}
        </>
      )}
    </div>
  );
}
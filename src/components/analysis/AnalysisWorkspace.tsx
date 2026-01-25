import { useCallback, useEffect, useMemo, useState } from 'react';

import type { AnalysisDirection, ElementType, ModelKind, RelationshipType, MatrixMetricId } from '../../domain';
import type { Selection } from '../model/selection';
import { useModelStore, useAnalysisPathsBetween, useAnalysisRelatedElements } from '../../store';

import '../../styles/crud.css';

import { AnalysisQueryPanel, type AnalysisMode } from './AnalysisQueryPanel';
import { AnalysisResultTable } from './AnalysisResultTable';
import { TraceabilityExplorer } from './TraceabilityExplorer';
import { PortfolioAnalysisView } from './PortfolioAnalysisView';
import { getAnalysisAdapter } from '../../analysis/adapters/registry';
import { buildRelationshipMatrix, type RelationshipMatrixDirection } from '../../domain/analysis/relationshipMatrix';
import { computeMatrixMetric } from '../../domain';
import { RelationshipMatrixTable } from './RelationshipMatrixTable';
import { RelationshipMatrixCellDialog } from './RelationshipMatrixCellDialog';
import { loadAnalysisUiState, mergeAnalysisUiState } from './analysisUiStateStorage';
import {
  loadMatrixPresets,
  loadMatrixSnapshots,
  saveMatrixPresets,
  saveMatrixSnapshots,
  type MatrixQueryPreset,
  type MatrixQuerySnapshot
} from './matrixPresetsStorage';

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
  const modelId = model?.id ?? '';

  const [mode, setMode] = useState<AnalysisMode>('related');

  // -----------------------------
  // Matrix (draft)
  // Touchpoints for Step 1+ (heatmaps + metrics): matrix metric selection (cell values), heatmap shading toggle, and
  // optional relationship-type weights will be added in this section and then forwarded to RelationshipMatrixTable.
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

  // Step 9: additional (persisted) matrix UI options.
  const [matrixHeatmapEnabled, setMatrixHeatmapEnabled] = useState<boolean>(false);
  const [matrixHideEmpty, setMatrixHideEmpty] = useState<boolean>(false);

  // Matrix cell-value metric selection (Step 2): in Step 3 this also drives heatmap shading.
  const [matrixCellMetricId, setMatrixCellMetricId] = useState<'off' | MatrixMetricId>('matrixRelationshipCount');

  // Step 8: weighted matrix metric configuration
  const matrixWeightPresets = useMemo(() => {
    const base = [{ id: 'default', label: 'Default (all 1)' }];
    if (modelKind === 'archimate') {
      base.push({ id: 'archimateDependencies', label: 'ArchiMate: dependency emphasis' });
    }
    return base;
  }, [modelKind]);

  const [matrixWeightPresetId, setMatrixWeightPresetId] = useState<string>('default');
  const [matrixWeightsByRelationshipType, setMatrixWeightsByRelationshipType] = useState<Record<string, number>>({});

  const weightsForMatrixPreset = useCallback((presetId: string): Record<string, number> => {
    if (presetId === 'archimateDependencies') {
      return {
        Access: 3,
        Serving: 2,
        Flow: 2,
        Triggering: 2,
        Influence: 2,
        Realization: 1,
        Assignment: 1,
        Association: 1,
        Aggregation: 1,
        Composition: 1,
        Specialization: 1,
      };
    }
    return {};
  }, []);

  const applyMatrixWeightPreset = useCallback((presetId: string): void => {
    setMatrixWeightPresetId(presetId);
    setMatrixWeightsByRelationshipType(weightsForMatrixPreset(presetId));
  }, [weightsForMatrixPreset]);

  useEffect(() => {
    // When model kind changes, reset to default to avoid applying ArchiMate weights to other notations.
    applyMatrixWeightPreset('default');
  }, [applyMatrixWeightPreset, modelKind]);

  const [matrixCellDialog, setMatrixCellDialog] = useState<{
    rowId: string;
    rowLabel: string;
    colId: string;
    colLabel: string;
    relationshipIds: string[];
  } | null>(null);

  const [matrixPresets, setMatrixPresets] = useState<MatrixQueryPreset[]>([]);
  const [matrixPresetId, setMatrixPresetId] = useState<string>('');
  const [matrixSnapshots, setMatrixSnapshots] = useState<MatrixQuerySnapshot[]>([]);
  const [matrixSnapshotId, setMatrixSnapshotId] = useState<string>('');

  useEffect(() => {
    if (!modelId) return;
    setMatrixPresets(loadMatrixPresets(modelId));
    setMatrixSnapshots(loadMatrixSnapshots(modelId));
    setMatrixPresetId('');
    setMatrixSnapshotId('');

    // Step 9: restore persisted Analysis UI state (mini-graph options are restored by AnalysisResultTable).
    const ui = loadAnalysisUiState(modelId);
    if (ui?.matrix) {
      const cellMetricId = ui.matrix.cellMetricId;
      if (cellMetricId && (cellMetricId === 'off' || cellMetricId === 'matrixRelationshipCount' || cellMetricId === 'matrixWeightedCount')) {
        setMatrixCellMetricId(cellMetricId);
      }
      if (typeof ui.matrix.heatmapEnabled === 'boolean') setMatrixHeatmapEnabled(ui.matrix.heatmapEnabled);
      if (typeof ui.matrix.hideEmpty === 'boolean') setMatrixHideEmpty(ui.matrix.hideEmpty);
      if (typeof ui.matrix.highlightMissing === 'boolean') setMatrixHighlightMissing(ui.matrix.highlightMissing);
      if (typeof ui.matrix.weightPresetId === 'string') {
        applyMatrixWeightPreset(ui.matrix.weightPresetId);
      }
      if (ui.matrix.weightsByRelationshipType && typeof ui.matrix.weightsByRelationshipType === 'object') {
        setMatrixWeightsByRelationshipType(ui.matrix.weightsByRelationshipType);
      }
    }
  }, [applyMatrixWeightPreset, modelId]);

  // Step 9: persist matrix UI settings per model.
  useEffect(() => {
    if (!modelId) return;
    mergeAnalysisUiState(modelId, {
      matrix: {
        cellMetricId: matrixCellMetricId,
        heatmapEnabled: matrixHeatmapEnabled,
        hideEmpty: matrixHideEmpty,
        highlightMissing: matrixHighlightMissing,
        weightPresetId: matrixWeightPresetId,
        weightsByRelationshipType: matrixWeightsByRelationshipType,
      }
    });
  }, [modelId, matrixCellMetricId, matrixHeatmapEnabled, matrixHideEmpty, matrixHighlightMissing, matrixWeightPresetId, matrixWeightsByRelationshipType]);

  // If cell values are disabled, heatmap shading doesn't make sense.
  useEffect(() => {
    if (matrixCellMetricId === 'off' && matrixHeatmapEnabled) setMatrixHeatmapEnabled(false);
  }, [matrixCellMetricId, matrixHeatmapEnabled]);


  function applyMatrixUiQuery(query: MatrixQueryPreset['query']): void {
    setMatrixRowSource(query.rowSource);
    setMatrixRowElementType(query.rowElementType);
    setMatrixRowLayer(query.rowLayer);
    setMatrixRowSelectionIds([...query.rowSelectionIds]);

    setMatrixColSource(query.colSource);
    setMatrixColElementType(query.colElementType);
    setMatrixColLayer(query.colLayer);
    setMatrixColSelectionIds([...query.colSelectionIds]);

    setDirection(query.direction);
    setRelationshipTypes(query.relationshipTypes);

    // Step 9: optional metric configuration (older presets may omit these).
    if (query.cellMetricId && (query.cellMetricId === 'off' || query.cellMetricId === 'matrixRelationshipCount' || query.cellMetricId === 'matrixWeightedCount')) {
      setMatrixCellMetricId(query.cellMetricId);
    }
    if (typeof query.heatmapEnabled === 'boolean') setMatrixHeatmapEnabled(query.heatmapEnabled);
    if (typeof query.hideEmpty === 'boolean') setMatrixHideEmpty(query.hideEmpty);
    if (typeof query.highlightMissing === 'boolean') setMatrixHighlightMissing(query.highlightMissing);
    if (typeof query.weightPresetId === 'string') applyMatrixWeightPreset(query.weightPresetId);
    if (query.weightsByRelationshipType && typeof query.weightsByRelationshipType === 'object') {
      setMatrixWeightsByRelationshipType(query.weightsByRelationshipType);
    }
  }

  function saveCurrentMatrixPreset(): void {
    if (!modelId) return;
    const name = window.prompt('Preset name?');
    if (!name) return;
    const preset: MatrixQueryPreset = {
      id: `preset_${Date.now()}`,
      name,
      createdAt: new Date().toISOString(),
      query: {
        rowSource: matrixRowSource,
        rowElementType: matrixRowElementType,
        rowLayer: matrixRowLayer,
        rowSelectionIds: [...matrixRowSelectionIds],
        colSource: matrixColSource,
        colElementType: matrixColElementType,
        colLayer: matrixColLayer,
        colSelectionIds: [...matrixColSelectionIds],
        direction,
        relationshipTypes: [...relationshipTypes],

        cellMetricId: matrixCellMetricId,
        heatmapEnabled: matrixHeatmapEnabled,
        hideEmpty: matrixHideEmpty,
        highlightMissing: matrixHighlightMissing,
        weightPresetId: matrixWeightPresetId,
        weightsByRelationshipType: matrixWeightsByRelationshipType,
      }
    };
    const next = [preset, ...matrixPresets].slice(0, 50);
    setMatrixPresets(next);
    setMatrixPresetId(preset.id);
    saveMatrixPresets(modelId, next);
  }

  function deleteSelectedMatrixPreset(): void {
    if (!modelId || !matrixPresetId) return;
    const preset = matrixPresets.find((p) => p.id === matrixPresetId);
    const ok = window.confirm(`Delete preset “${preset?.name ?? 'Unnamed'}”?`);
    if (!ok) return;
    const next = matrixPresets.filter((p) => p.id !== matrixPresetId);
    setMatrixPresets(next);
    setMatrixPresetId('');
    saveMatrixPresets(modelId, next);
  }

  function saveMatrixSnapshot(): void {
    if (!modelId || !matrixBuiltQuery || !matrixResult) return;
    const name = window.prompt('Snapshot name?');
    if (!name) return;

    let missingCells = 0;
    let nonZeroCells = 0;
    for (const row of matrixResult.cells) {
      for (const cell of row) {
        if (cell.count === 0) missingCells += 1;
        else nonZeroCells += 1;
      }
    }

    const matrixDirection: RelationshipMatrixDirection =
      direction === 'outgoing' ? 'rowToCol' : direction === 'incoming' ? 'colToRow' : 'both';

    const snapshot: MatrixQuerySnapshot = {
      id: `snap_${Date.now()}`,
      name,
      createdAt: new Date().toISOString(),
      builtQuery: {
        rowIds: [...matrixBuiltQuery.rowIds],
        colIds: [...matrixBuiltQuery.colIds],
        direction: matrixDirection,
        relationshipTypes: [...matrixBuiltQuery.relationshipTypes],
      },
      uiQuery: {
        rowSource: matrixRowSource,
        rowElementType: matrixRowElementType,
        rowLayer: matrixRowLayer,
        rowSelectionIds: [...matrixRowSelectionIds],
        colSource: matrixColSource,
        colElementType: matrixColElementType,
        colLayer: matrixColLayer,
        colSelectionIds: [...matrixColSelectionIds],
        direction,
        relationshipTypes: [...relationshipTypes],

        cellMetricId: matrixCellMetricId,
        heatmapEnabled: matrixHeatmapEnabled,
        hideEmpty: matrixHideEmpty,
        highlightMissing: matrixHighlightMissing,
        weightPresetId: matrixWeightPresetId,
        weightsByRelationshipType: matrixWeightsByRelationshipType,
      },
      summary: {
        rowCount: matrixResult.rows.length,
        colCount: matrixResult.cols.length,
        grandTotal: matrixResult.grandTotal,
        missingCells,
        nonZeroCells,
      }
    };

    const next = [snapshot, ...matrixSnapshots].slice(0, 50);
    setMatrixSnapshots(next);
    saveMatrixSnapshots(modelId, next);
  }

  function restoreMatrixSnapshot(snapshotId: string): void {
    const snap = matrixSnapshots.find((s) => s.id === snapshotId);
    if (!snap) return;
    applyMatrixUiQuery(snap.uiQuery);
    setMatrixBuiltQuery({
      rowIds: [...snap.builtQuery.rowIds],
      colIds: [...snap.builtQuery.colIds],
      relationshipTypes: [...snap.builtQuery.relationshipTypes],
      direction: snap.builtQuery.direction,
    });
    setMatrixBuildNonce((n) => n + 1);
  }

  function deleteMatrixSnapshot(snapshotId: string): void {
    if (!modelId) return;
    const snap = matrixSnapshots.find((s) => s.id === snapshotId);
    const ok = window.confirm(`Delete snapshot “${snap?.name ?? 'Unnamed'}”?`);
    if (!ok) return;
    const next = matrixSnapshots.filter((s) => s.id !== snapshotId);
    setMatrixSnapshots(next);
    saveMatrixSnapshots(modelId, next);
  }



  // -----------------------------
  // Filters (draft)
  // Touchpoints for Step 4+ (score overlays): node overlay metric id/params and render toggles (badge/scale)
  // will live next to these global filters (direction/layer/type), because overlays usually respect the same filtering.
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
  }, [mode, maxDepth]);
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

  const matrixCellValues = useMemo(() => {
    if (!model || !matrixBuiltQuery) return undefined;
    if (matrixCellMetricId === 'off') return undefined;
    const baseParams = {
      rowIds: matrixBuiltQuery.rowIds,
      colIds: matrixBuiltQuery.colIds,
      filters: {
        direction: matrixBuiltQuery.direction,
        relationshipTypes: matrixBuiltQuery.relationshipTypes.length ? matrixBuiltQuery.relationshipTypes : undefined,
      },
      options: { includeSelf: false },
    } as const;

    if (matrixCellMetricId === 'matrixWeightedCount') {
      return computeMatrixMetric(model, 'matrixWeightedCount', {
        ...baseParams,
        weightsByRelationshipType: matrixWeightsByRelationshipType,
        defaultWeight: 1,
      }).values;
    }

    return computeMatrixMetric(model, matrixCellMetricId, baseParams).values;
  }, [matrixBuiltQuery, matrixCellMetricId, matrixWeightsByRelationshipType, model]);

  const matrixRelationshipTypesForWeights = useMemo(() => {
    if (!model || !matrixResult) return [] as string[];
    const found = new Set<string>();
    for (const row of matrixResult.cells) {
      for (const cell of row) {
        for (const id of cell.relationshipIds) {
          const rel = model.relationships[id];
          if (!rel) continue;
          found.add(String(rel.type));
        }
      }
    }
    return Array.from(found).sort((a, b) => a.localeCompare(b));
  }, [matrixResult, model]);

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
  };  const swapMatrixAxes = () => {
    const prevRowSource = matrixRowSource;
    const prevRowElementType = matrixRowElementType;
    const prevRowLayer = matrixRowLayer;
    const prevRowSelectionIds = matrixRowSelectionIds;

    setMatrixRowSource(matrixColSource);
    setMatrixRowElementType(matrixColElementType);
    setMatrixRowLayer(matrixColLayer);
    setMatrixRowSelectionIds(matrixColSelectionIds);

    setMatrixColSource(prevRowSource);
    setMatrixColElementType(prevRowElementType);
    setMatrixColLayer(prevRowLayer);
    setMatrixColSelectionIds(prevRowSelectionIds);

    // Clear built result to avoid showing stale matrix after swapping.
    setMatrixBuiltQuery(null);
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
          <button
            type="button"
            className={`tabButton ${mode === 'portfolio' ? 'isActive' : ''}`}
            role="tab"
            aria-selected={mode === 'portfolio'}
            onClick={() => setMode('portfolio')}
          >
            Portfolio
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
{mode !== 'portfolio' ? (
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
            onSwapMatrixAxes={swapMatrixAxes}

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
          ) : null}


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

                  <div className="toolbar" aria-label="Matrix presets toolbar" style={{ justifyContent: 'flex-end' }}>
                    <div className="toolbarGroup" style={{ minWidth: 220 }}>
                      <label htmlFor="matrix-preset" className="crudLabel">Preset</label>
                      <select
                        id="matrix-preset"
                        className="crudInput"
                        value={matrixPresetId}
                        onChange={(e) => setMatrixPresetId(e.target.value)}
                      >
                        <option value="">(none)</option>
                        {matrixPresets.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="toolbarGroup">
                      <label style={{ visibility: 'hidden' }} aria-hidden="true">Actions</label>
                      <button type="button" className="shellButton" onClick={saveCurrentMatrixPreset}>
                        Save preset
                      </button>
                    </div>

                    <div className="toolbarGroup">
                      <label style={{ visibility: 'hidden' }} aria-hidden="true">Apply</label>
                      <button
                        type="button"
                        className="shellButton"
                        disabled={!matrixPresetId}
                        onClick={() => {
                          const p = matrixPresets.find((x) => x.id === matrixPresetId);
                          if (p) applyMatrixUiQuery(p.query);
                        }}
                      >
                        Apply
                      </button>
                    </div>

                    <div className="toolbarGroup">
                      <label style={{ visibility: 'hidden' }} aria-hidden="true">Delete</label>
                      <button
                        type="button"
                        className="shellButton"
                        disabled={!matrixPresetId}
                        onClick={deleteSelectedMatrixPreset}
                      >
                        Delete
                      </button>
                    </div>

                    <div className="toolbarGroup">
                      <label style={{ visibility: 'hidden' }} aria-hidden="true">Snapshot</label>
                      <button
                        type="button"
                        className="shellButton"
                        disabled={!matrixResult}
                        onClick={saveMatrixSnapshot}
                      >
                        Save snapshot
                      </button>
                    </div>

                    <div className="toolbarGroup" style={{ minWidth: 240 }}>
                      <label htmlFor="matrix-snapshot" className="crudLabel">Snapshot</label>
                      <select
                        id="matrix-snapshot"
                        className="crudInput"
                        value={matrixSnapshotId}
                        onChange={(e) => setMatrixSnapshotId(e.target.value)}
                      >
                        <option value="">(none)</option>
                        {matrixSnapshots.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="toolbarGroup">
                      <label style={{ visibility: 'hidden' }} aria-hidden="true">Restore</label>
                      <button
                        type="button"
                        className="shellButton"
                        disabled={!matrixSnapshotId}
                        onClick={() => restoreMatrixSnapshot(matrixSnapshotId)}
                      >
                        Restore
                      </button>
                    </div>

                    <div className="toolbarGroup">
                      <label style={{ visibility: 'hidden' }} aria-hidden="true">Delete snapshot</label>
                      <button
                        type="button"
                        className="shellButton"
                        disabled={!matrixSnapshotId}
                        onClick={() => {
                          const id = matrixSnapshotId;
                          setMatrixSnapshotId('');
                          deleteMatrixSnapshot(id);
                        }}
                      >
                        Delete snapshot
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {matrixResult ? (
                <RelationshipMatrixTable
                  modelName={model.metadata?.name || 'model'}
                  result={matrixResult}
                  cellMetricId={matrixCellMetricId}
                  onChangeCellMetricId={(v) => setMatrixCellMetricId(v)}
                  weightsByRelationshipType={matrixWeightsByRelationshipType}
                  onChangeRelationshipTypeWeight={(relationshipType, weight) =>
                    setMatrixWeightsByRelationshipType((prev) => ({ ...prev, [relationshipType]: weight }))
                  }
                  weightPresets={matrixWeightPresets}
                  weightPresetId={matrixWeightPresetId}
                  onChangeWeightPresetId={(presetId) => applyMatrixWeightPreset(presetId)}
                  relationshipTypesForWeights={matrixRelationshipTypesForWeights}
                  cellValues={matrixCellValues}
                  highlightMissing={matrixHighlightMissing}
                  onToggleHighlightMissing={() => setMatrixHighlightMissing((v) => !v)}
                  heatmapEnabled={matrixHeatmapEnabled}
                  onChangeHeatmapEnabled={setMatrixHeatmapEnabled}
                  hideEmpty={matrixHideEmpty}
                  onChangeHideEmpty={setMatrixHideEmpty}
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
          ) : mode === 'portfolio' ? (
            <PortfolioAnalysisView
              model={model}
              modelKind={modelKind}
              selection={selection}
              onSelectElement={(elementId) => onSelect({ kind: 'element', elementId })}
            />
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
              direction={direction}
              relationshipTypes={relationshipTypes}
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
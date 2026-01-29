import { useCallback, useMemo } from 'react';

import type {
  AnalysisQueryPanelActions,
  AnalysisQueryPanelMeta,
  AnalysisQueryPanelState,
  AnalysisMode,
} from '../../AnalysisQueryPanel';
import type { AnalysisDirection, ElementType, RelationshipType } from '../../../../domain';
import type { useMatrixWorkspaceState } from '../useMatrixWorkspaceState';

type MatrixWorkspace = ReturnType<typeof useMatrixWorkspaceState>;

type Args = {
  mode: AnalysisMode;
  setMode: (mode: AnalysisMode) => void;

  selectionElementIds: string[];

  draft: {
    startId: string;
    sourceId: string;
    targetId: string;
    setStartId: (id: string) => void;
    setSourceId: (id: string) => void;
    setTargetId: (id: string) => void;
    useSelection: (which: 'start' | 'source' | 'target') => void;
  };

  filters: {
    direction: AnalysisDirection;
    relationshipTypes: RelationshipType[];
    layers: string[];
    elementTypes: ElementType[];
    maxDepth: number;
    includeStart: boolean;
    maxPaths: number;
    maxPathLength: number | null;

    setDirection: (v: AnalysisDirection) => void;
    setRelationshipTypes: (v: RelationshipType[]) => void;
    setLayers: (v: string[]) => void;
    setElementTypes: (v: ElementType[]) => void;
    setMaxDepth: (v: number) => void;
    setIncludeStart: (v: boolean) => void;
    setMaxPaths: (v: number) => void;
    setMaxPathLength: (v: number | null) => void;

    applyPreset: (presetId: 'upstream' | 'downstream' | 'crossLayerTrace' | 'clear') => void;
  };

  matrix: {
    state: MatrixWorkspace['state'];
    actions: MatrixWorkspace['actions'];
    derived: MatrixWorkspace['derived'];
  };

  canRun: boolean;
  canUseSelection: boolean;
  run: () => void;
};

export function useQueryPanelAdapter({
  mode,
  setMode,
  selectionElementIds,
  draft,
  filters,
  matrix,
  canRun,
  canUseSelection,
  run,
}: Args): { state: AnalysisQueryPanelState; actions: AnalysisQueryPanelActions; meta: AnalysisQueryPanelMeta } {
  const matrixUiQuery = matrix.state.uiQuery;

  const applySelectedMatrixPreset = useCallback(() => {
    const p = matrix.state.presets.presets.find((x) => x.id === matrix.state.presets.presetId);
    if (!p) return;
    matrix.actions.presets.applyUiQuery(p.query);
    filters.setDirection(p.query.direction);
    filters.setRelationshipTypes([...p.query.relationshipTypes]);
  }, [filters, matrix.actions.presets, matrix.state.presets.presetId, matrix.state.presets.presets]);

  const restoreSelectedMatrixSnapshot = useCallback(() => {
    const snap = matrix.state.presets.snapshots.find((s) => s.id === matrix.state.presets.snapshotId);
    if (!snap) return;
    matrix.actions.presets.applyUiQuery(snap.uiQuery);
    filters.setDirection(snap.uiQuery.direction);
    filters.setRelationshipTypes([...snap.uiQuery.relationshipTypes]);
    matrix.actions.presets.restoreSnapshot(matrix.state.presets.snapshotId);
  }, [filters, matrix.actions.presets, matrix.state.presets.snapshotId, matrix.state.presets.snapshots]);

  const deleteSelectedMatrixSnapshot = useCallback(() => {
    const id = matrix.state.presets.snapshotId;
    matrix.actions.presets.setSnapshotId('');
    if (id) matrix.actions.presets.deleteSnapshot(id);
  }, [matrix.actions.presets, matrix.state.presets.snapshotId]);

  const state: AnalysisQueryPanelState = useMemo(
    () => ({
      mode,
      selectionElementIds,
      draft: {
        startId: draft.startId,
        sourceId: draft.sourceId,
        targetId: draft.targetId,
      },
      filters: {
        direction: filters.direction,
        relationshipTypes: filters.relationshipTypes,
        layers: filters.layers,
        elementTypes: filters.elementTypes,
        maxDepth: filters.maxDepth,
        includeStart: filters.includeStart,
        maxPaths: filters.maxPaths,
        maxPathLength: filters.maxPathLength,
      },
      matrix: {
        rowSource: matrix.state.axes.rowSource,
        rowElementType: matrix.state.axes.rowElementType,
        rowLayer: matrix.state.axes.rowLayer,
        rowSelectionIds: matrix.state.axes.rowSelectionIds,

        colSource: matrix.state.axes.colSource,
        colElementType: matrix.state.axes.colElementType,
        colLayer: matrix.state.axes.colLayer,
        colSelectionIds: matrix.state.axes.colSelectionIds,

        resolvedRowCount: matrix.state.axes.rowIds.length,
        resolvedColCount: matrix.state.axes.colIds.length,
        hasBuilt: Boolean(matrix.state.build.builtQuery),
        buildNonce: matrix.state.build.buildNonce,

        presets: matrix.state.presets.presets,
        presetId: matrix.state.presets.presetId,

        snapshots: matrix.state.presets.snapshots,
        snapshotId: matrix.state.presets.snapshotId,
        canSaveSnapshot: Boolean(matrix.derived.result),
      },
    }),
    [
      draft.sourceId,
      draft.startId,
      draft.targetId,
      filters.direction,
      filters.elementTypes,
      filters.includeStart,
      filters.layers,
      filters.maxDepth,
      filters.maxPathLength,
      filters.maxPaths,
      filters.relationshipTypes,
      matrix.derived.result,
      matrix.state.axes.colElementType,
      matrix.state.axes.colIds.length,
      matrix.state.axes.colLayer,
      matrix.state.axes.colSelectionIds,
      matrix.state.axes.colSource,
      matrix.state.axes.rowElementType,
      matrix.state.axes.rowIds.length,
      matrix.state.axes.rowLayer,
      matrix.state.axes.rowSelectionIds,
      matrix.state.axes.rowSource,
      matrix.state.build.builtQuery,
      matrix.state.build.buildNonce,
      matrix.state.presets.presetId,
      matrix.state.presets.presets,
      matrix.state.presets.snapshotId,
      matrix.state.presets.snapshots,
      mode,
      selectionElementIds,
    ]
  );

  const actions: AnalysisQueryPanelActions = useMemo(
    () => ({
      setMode,
      run,
      draft: {
        setStartId: draft.setStartId,
        setSourceId: draft.setSourceId,
        setTargetId: draft.setTargetId,
        useSelection: draft.useSelection,
      },
      filters: {
        setDirection: filters.setDirection,
        setRelationshipTypes: filters.setRelationshipTypes,
        setLayers: filters.setLayers,
        setElementTypes: filters.setElementTypes,
        setMaxDepth: filters.setMaxDepth,
        setIncludeStart: filters.setIncludeStart,
        setMaxPaths: filters.setMaxPaths,
        setMaxPathLength: filters.setMaxPathLength,
        applyPreset: filters.applyPreset,
      },
      matrix: {
        setRowSource: matrix.actions.axes.setRowSource,
        setRowElementType: matrix.actions.axes.setRowElementType,
        setRowLayer: matrix.actions.axes.setRowLayer,
        setRowSelectionIds: matrix.actions.axes.setRowSelectionIds,
        captureRowSelection: matrix.actions.axes.captureSelectionAsRows,

        setColSource: matrix.actions.axes.setColSource,
        setColElementType: matrix.actions.axes.setColElementType,
        setColLayer: matrix.actions.axes.setColLayer,
        setColSelectionIds: matrix.actions.axes.setColSelectionIds,
        captureColSelection: matrix.actions.axes.captureSelectionAsCols,

        swapAxes: matrix.actions.axes.swapAxes,

        setPresetId: matrix.actions.presets.setPresetId,
        savePreset: () => matrix.actions.presets.saveCurrentPreset(matrixUiQuery),
        applySelectedPreset: applySelectedMatrixPreset,
        deleteSelectedPreset: matrix.actions.presets.deleteSelectedPreset,

        setSnapshotId: matrix.actions.presets.setSnapshotId,
        saveSnapshot: () => matrix.actions.presets.saveSnapshot(matrixUiQuery),
        restoreSelectedSnapshot: restoreSelectedMatrixSnapshot,
        deleteSelectedSnapshot: deleteSelectedMatrixSnapshot,
      },
    }),
    [
      applySelectedMatrixPreset,
      deleteSelectedMatrixSnapshot,
      draft,
      filters,
      matrix.actions.axes,
      matrix.actions.presets,
      matrixUiQuery,
      restoreSelectedMatrixSnapshot,
      run,
      setMode,
    ]
  );

  const meta: AnalysisQueryPanelMeta = useMemo(
    () => ({
      canRun,
      canUseSelection,
    }),
    [canRun, canUseSelection]
  );

  return { state, actions, meta };
}

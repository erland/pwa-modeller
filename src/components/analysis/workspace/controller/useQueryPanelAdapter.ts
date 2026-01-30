import { useCallback, useMemo } from 'react';

import type {
  AnalysisQueryPanelActions,
  AnalysisQueryPanelMeta,
  AnalysisQueryPanelState,
  AnalysisMode,
} from '../../AnalysisQueryPanel';
import type { AnalysisDirection, ElementType, RelationshipType } from '../../../../domain';
import type { PathsBetweenQueryMode } from '../../../../store';
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
    pathsMode: PathsBetweenQueryMode;

    setDirection: (v: AnalysisDirection) => void;
    setRelationshipTypes: (v: RelationshipType[]) => void;
    setLayers: (v: string[]) => void;
    setElementTypes: (v: ElementType[]) => void;
    setMaxDepth: (v: number) => void;
    setIncludeStart: (v: boolean) => void;
    setMaxPaths: (v: number) => void;
    setMaxPathLength: (v: number | null) => void;
    setPathsMode: (v: PathsBetweenQueryMode) => void;

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

  const {
    direction,
    relationshipTypes,
    layers,
    elementTypes,
    maxDepth,
    includeStart,
    maxPaths,
    maxPathLength,
    pathsMode,
    setDirection,
    setRelationshipTypes,
    setLayers,
    setElementTypes,
    setMaxDepth,
    setIncludeStart,
    setMaxPaths,
    setMaxPathLength,
    setPathsMode,
    applyPreset,
  } = filters;

  const {
    startId: draftStartId,
    sourceId: draftSourceId,
    targetId: draftTargetId,
    setStartId: setDraftStartId,
    setSourceId: setDraftSourceId,
    setTargetId: setDraftTargetId,
    useSelection: useSelectionAs,
  } = draft;

  const applySelectedMatrixPreset = useCallback(() => {
    const p = matrix.state.presets.presets.find((x) => x.id === matrix.state.presets.presetId);
    if (!p) return;
    matrix.actions.presets.applyUiQuery(p.query);
    setDirection(p.query.direction);
    setRelationshipTypes([...p.query.relationshipTypes]);
  }, [matrix.actions.presets, matrix.state.presets.presetId, matrix.state.presets.presets, setDirection, setRelationshipTypes]);

  const restoreSelectedMatrixSnapshot = useCallback(() => {
    const snap = matrix.state.presets.snapshots.find((s) => s.id === matrix.state.presets.snapshotId);
    if (!snap) return;
    matrix.actions.presets.applyUiQuery(snap.uiQuery);
    setDirection(snap.uiQuery.direction);
    setRelationshipTypes([...snap.uiQuery.relationshipTypes]);
    matrix.actions.presets.restoreSnapshot(matrix.state.presets.snapshotId);
  }, [matrix.actions.presets, matrix.state.presets.snapshotId, matrix.state.presets.snapshots, setDirection, setRelationshipTypes]);

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
        startId: draftStartId,
        sourceId: draftSourceId,
        targetId: draftTargetId,
      },
      filters: {
        direction,
        relationshipTypes,
        layers,
        elementTypes,
        maxDepth,
        includeStart,
        maxPaths,
        maxPathLength,
        pathsMode,
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
      draftSourceId,
      draftStartId,
      draftTargetId,
      direction,
      elementTypes,
      includeStart,
      layers,
      maxDepth,
      maxPathLength,
      maxPaths,
      pathsMode,
      relationshipTypes,
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
        setStartId: setDraftStartId,
        setSourceId: setDraftSourceId,
        setTargetId: setDraftTargetId,
        useSelection: useSelectionAs,
      },
      filters: {
        setDirection,
        setRelationshipTypes,
        setLayers,
        setElementTypes,
        setMaxDepth,
        setIncludeStart,
        setMaxPaths,
        setMaxPathLength,
        setPathsMode,
        applyPreset,
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
      applyPreset,
      setDraftSourceId,
      setDraftStartId,
      setDraftTargetId,
      setDirection,
      setElementTypes,
      setIncludeStart,
      setLayers,
      setMaxDepth,
      setMaxPathLength,
      setMaxPaths,
      setPathsMode,
      setRelationshipTypes,
      useSelectionAs,
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

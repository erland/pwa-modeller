import { useCallback, useEffect, useMemo, useState } from 'react';

import type { AnalysisDirection, ElementType, ModelKind, RelationshipType } from '../../../domain';
import type { Selection } from '../../model/selection';
import { useAnalysisPathsBetween, useAnalysisRelatedElements, useModelStore } from '../../../store';

import type { AnalysisMode } from '../AnalysisQueryPanel';
import { useMatrixWorkspaceState } from './useMatrixWorkspaceState';

import {
  buildPathsAnalysisOpts,
  buildRelatedAnalysisOpts,
  computeCanRun,
  computeTraceSeedId,
  selectionToElementId,
  selectionToElementIds,
} from './analysisWorkspaceUtils';

export type MatrixCellDialogInfo = {
  rowId: string;
  rowLabel: string;
  colId: string;
  colLabel: string;
  relationshipIds: string[];
};

export function useAnalysisWorkspaceController({
  modelKind,
  selection,
}: {
  modelKind: ModelKind;
  selection: Selection;
}) {
  const model = useModelStore((s) => s.model);
  const modelId = model?.id ?? '';

  const [mode, setMode] = useState<AnalysisMode>('related');

  // -----------------------------
  // Global filters (draft)
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

  // Keep "Start element" (Related/Traceability) and "Source" (Connection between two) in sync.
  // This makes it easy to switch between views without having to re-pick the baseline element.
  const onChangeDraftStartIdSync = useCallback((id: string) => {
    setDraftStartId(id);
    setDraftSourceId(id);
  }, []);

  const onChangeDraftSourceIdSync = useCallback((id: string) => {
    setDraftSourceId(id);
    setDraftStartId(id);
  }, []);

  // If the user has an element selected and the draft is empty, prefill to reduce friction.
  useEffect(() => {
    const picked = selectionToElementId(selection);
    if (!picked) return;

    if (mode !== 'paths' && mode !== 'matrix') {
      if (!draftStartId) onChangeDraftStartIdSync(picked);
      return;
    }
    if (mode === 'paths') {
      if (!draftSourceId) onChangeDraftSourceIdSync(picked);
      else if (!draftTargetId && draftSourceId !== picked) setDraftTargetId(picked);
    }
  }, [selection, mode, draftStartId, draftSourceId, draftTargetId, onChangeDraftStartIdSync, onChangeDraftSourceIdSync]);

  const relatedOpts = useMemo(
    () =>
      buildRelatedAnalysisOpts({
        direction,
        maxDepth,
        includeStart,
        relationshipTypes,
        layers,
        elementTypes,
      }),
    [direction, maxDepth, includeStart, relationshipTypes, layers, elementTypes]
  );

  const pathsOpts = useMemo(
    () =>
      buildPathsAnalysisOpts({
        direction,
        maxPaths,
        maxPathLength,
        relationshipTypes,
        layers,
        elementTypes,
      }),
    [direction, maxPaths, maxPathLength, relationshipTypes, layers, elementTypes]
  );

  // Results are driven by active element selection + *draft* filters (QoL).
  const relatedResult = useAnalysisRelatedElements(activeStartId || null, relatedOpts);
  const pathsResult = useAnalysisPathsBetween(activeSourceId || null, activeTargetId || null, pathsOpts);

  const selectionElementIds = useMemo(() => selectionToElementIds(selection), [selection]);

  // -----------------------------
  // Matrix workspace state (draft + persisted UI options + presets/snapshots)
  // -----------------------------
  const matrixWorkspace = useMatrixWorkspaceState({
    model,
    modelId,
    modelKind,
    direction,
    relationshipTypes,
    selectionElementIds,
  });

  const matrixState = matrixWorkspace.state;
  const matrixActions = matrixWorkspace.actions;
  const matrixDerived = matrixWorkspace.derived;

  const [matrixCellDialog, setMatrixCellDialog] = useState<MatrixCellDialogInfo | null>(null);

  const canRun = computeCanRun({
    modelPresent: Boolean(model),
    mode,
    matrixResolvedRowCount: matrixState.axes.rowIds.length,
    matrixResolvedColCount: matrixState.axes.colIds.length,
    draftStartId,
    draftSourceId,
    draftTargetId,
  });

  const run = useCallback(() => {
    if (!model) return;
    if (mode === 'matrix') {
      matrixActions.build.build();
      return;
    }
    if (mode !== 'paths') {
      setActiveStartId(draftStartId);
      return;
    }
    setActiveSourceId(draftSourceId);
    setActiveTargetId(draftTargetId);
    // Keep related/traceability baseline aligned with the chosen source.
    setActiveStartId(draftSourceId);
  }, [draftSourceId, draftStartId, draftTargetId, matrixActions.build, model, mode]);

  const applyPreset = useCallback(
    (presetId: 'upstream' | 'downstream' | 'crossLayerTrace' | 'clear') => {
      if (presetId === 'clear') {
        setDirection('both');
        setRelationshipTypes([]);
        setLayers([]);
        setElementTypes([]);
        setMaxDepth(4);
        setIncludeStart(false);
        setMaxPaths(10);
        setMaxPathLength(null);
        matrixActions.axes.resetDraft();
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
    },
    [matrixActions.axes]
  );

  const useSelectionAs = useCallback(
    (which: 'start' | 'source' | 'target') => {
      const picked = selectionToElementId(selection);
      if (!picked) return;
      if (which === 'start') onChangeDraftStartIdSync(picked);
      if (which === 'source') onChangeDraftSourceIdSync(picked);
      if (which === 'target') setDraftTargetId(picked);
    },
    [onChangeDraftSourceIdSync, onChangeDraftStartIdSync, selection]
  );

  const openTraceabilityFrom = useCallback((elementId: string) => {
    setMode('traceability');
    setDraftStartId(elementId);
    setActiveStartId(elementId);
  }, []);

  const traceSeedId = useMemo(
    () => computeTraceSeedId({ activeStartId, draftStartId, selection }),
    [activeStartId, draftStartId, selection]
  );

  const canOpenTraceability = Boolean(selectionToElementId(selection));
  const openTraceabilityFromSelection = useCallback(() => {
    const picked = selectionToElementId(selection);
    if (picked) openTraceabilityFrom(picked);
  }, [openTraceabilityFrom, selection]);

  return {
    state: {
      model,
      modelId,
      mode,
      direction,
      relationshipTypes,
      layers,
      elementTypes,
      maxDepth,
      includeStart,
      maxPaths,
      maxPathLength,
      draftStartId,
      draftSourceId,
      draftTargetId,
      matrixCellDialog,
      matrixState,
    },
    actions: {
      setMode,
      setDirection,
      setRelationshipTypes,
      setLayers,
      setElementTypes,
      setMaxDepth,
      setIncludeStart,
      setMaxPaths,
      setMaxPathLength,
      onChangeDraftStartId: onChangeDraftStartIdSync,
      onChangeDraftSourceId: onChangeDraftSourceIdSync,
      onChangeDraftTargetId: setDraftTargetId,
      run,
      applyPreset,
      useSelectionAs,
      openTraceabilityFrom,
      setMatrixCellDialog,
      matrixActions,
    },
    derived: {
      selectionElementIds,
      canRun,
      canOpenTraceability,
      openTraceabilityFromSelection,
      relatedResult,
      pathsResult,
      traceSeedId,
      matrixDerived,
      matrixUiQuery: matrixState.uiQuery,
    },
  } as const;
}

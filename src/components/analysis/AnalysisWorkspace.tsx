import { useEffect, useMemo, useState } from 'react';

import type {
  AnalysisDirection,
  ArchimateLayer,
  ElementType,
  ModelKind,
  RelationshipType
} from '../../domain';
import type { Selection } from '../model/selection';
import { useModelStore, useAnalysisPathsBetween, useAnalysisRelatedElements } from '../../store';

import '../../styles/crud.css';

import { AnalysisQueryPanel, type AnalysisMode } from './AnalysisQueryPanel';
import { AnalysisResultTable } from './AnalysisResultTable';

function selectionToElementId(sel: Selection): string | null {
  switch (sel.kind) {
    case 'element':
      return sel.elementId;
    case 'viewNode':
      return sel.elementId;
    case 'relationship':
      // For now we don't map relationship -> endpoint; Step 4+ can add this if desired.
      return null;
    default:
      return null;
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
  // Filters (draft)
  // -----------------------------
  const [direction, setDirection] = useState<AnalysisDirection>('both');
  const [relationshipTypes, setRelationshipTypes] = useState<RelationshipType[]>([]);
  const [archimateLayers, setArchimateLayers] = useState<ArchimateLayer[]>([]);
  const [elementTypes, setElementTypes] = useState<ElementType[]>([]);

  // Related-only
  const [maxDepth, setMaxDepth] = useState<number>(4);
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

    if (mode === 'related') {
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
      archimateLayers: archimateLayers.length ? archimateLayers : undefined,
      elementTypes: elementTypes.length ? elementTypes : undefined
    }),
    [direction, maxDepth, includeStart, relationshipTypes, archimateLayers, elementTypes]
  );

  const pathsOpts = useMemo(
    () => ({
      direction,
      maxPaths,
      maxPathLength: maxPathLength === null ? undefined : maxPathLength,
      relationshipTypes: relationshipTypes.length ? relationshipTypes : undefined,
      archimateLayers: archimateLayers.length ? archimateLayers : undefined,
      elementTypes: elementTypes.length ? elementTypes : undefined
    }),
    [direction, maxPaths, maxPathLength, relationshipTypes, archimateLayers, elementTypes]
  );

  // Results are driven by active element selection + *draft* filters (QoL).
  const relatedResult = useAnalysisRelatedElements(activeStartId || null, relatedOpts);
  const pathsResult = useAnalysisPathsBetween(activeSourceId || null, activeTargetId || null, pathsOpts);

  const canRun = Boolean(
    model &&
      (mode === 'related' ? draftStartId : draftSourceId && draftTargetId && draftSourceId !== draftTargetId)
  );

  function run() {
    if (!model) return;
    if (mode === 'related') {
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
      setArchimateLayers([]);
      setElementTypes([]);
      setMaxDepth(4);
      setIncludeStart(false);
      setMaxPaths(10);
      setMaxPathLength(null);
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
    setArchimateLayers(['Business', 'Application', 'Technology']);
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
            direction={direction}
            onChangeDirection={setDirection}
            relationshipTypes={relationshipTypes}
            onChangeRelationshipTypes={setRelationshipTypes}
            archimateLayers={archimateLayers}
            onChangeArchimateLayers={setArchimateLayers}
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

          <AnalysisResultTable
            model={model}
            mode={mode}
            relatedResult={relatedResult}
            pathsResult={pathsResult}
            selection={selection}
            onSelectRelationship={(relationshipId) => onSelect({ kind: 'relationship', relationshipId })}
            onSelectElement={(elementId) => onSelect({ kind: 'element', elementId })}
          />
        </>
      )}
    </div>
  );
}

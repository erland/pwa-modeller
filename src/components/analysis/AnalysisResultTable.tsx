import { useEffect, useMemo, useState } from 'react';

import type { AnalysisDirection, Model, PathsBetweenResult, RelatedElementsResult, RelationshipType } from '../../domain';
import { discoverNumericPropertyKeys } from '../../domain';
import type { ModelKind } from '../../domain/types';
import type { AnalysisMode } from './AnalysisQueryPanel';
import type { Selection } from '../model/selection';

import { getAnalysisAdapter } from '../../analysis/adapters/registry';

import { QuickTooltip } from './QuickTooltip';
import { useMiniGraphOptionsForModel } from './results/useMiniGraphOptionsForModel';
import { createAnalysisResultFormatters } from './results/analysisResultFormatters';
import { RelatedResultsSection } from './results/RelatedResultsSection';
import { PathsResultsSection } from './results/PathsResultsSection';

import '../../styles/crud.css';

type Props = {
  model: Model;
  modelKind: ModelKind;
  mode: AnalysisMode;

  relatedResult: RelatedElementsResult | null;
  pathsResult: PathsBetweenResult | null;
  selection: Selection;
  direction: AnalysisDirection;
  relationshipTypes: RelationshipType[];
  onSelectRelationship: (relationshipId: string) => void;
  onSelectElement: (elementId: string) => void;
  onOpenTraceability: (elementId: string) => void;

  /**
   * Optional: open the current results (or the mini-graph) in the Analysis Sandbox.
   * This is used by Step 8 of the sandbox plan.
   */
  onOpenSandbox?: (args: {
    elementIds: string[];
    relationshipIds?: string[];
    relationshipTypes?: string[];
    layout?: { mode: 'grid' | 'distance' | 'levels'; levelById?: Record<string, number>; orderById?: Record<string, number> };
  }) => void;
};

export function AnalysisResultTable({
  model,
  modelKind,
  mode,
  direction,
  relationshipTypes,
  relatedResult,
  pathsResult,
  selection,
  onSelectRelationship,
  onSelectElement,
  onOpenTraceability,
  onOpenSandbox,
}: Props) {
  const adapter = getAnalysisAdapter(modelKind);
  const modelId = model.id ?? '';
  const modelName = model.metadata?.name || 'model';

  const { graphOptions, setGraphOptions } = useMiniGraphOptionsForModel(modelId);
  const availablePropertyKeys = useMemo(() => discoverNumericPropertyKeys(model), [model]);
  const formatters = useMemo(() => createAnalysisResultFormatters(adapter, model), [adapter, model]);

  const [showGraph, setShowGraph] = useState(false);
  const [selectedPathIndex, setSelectedPathIndex] = useState<number | null>(null);
  const [showAllPathsInMiniGraph, setShowAllPathsInMiniGraph] = useState(false);

  const [tooltip, setTooltip] = useState<{ x: number; y: number; title: string; lines: string[] } | null>(null);

  // Auto-enable the graph once results appear (but don't force it back on if the user turns it off).
  useEffect(() => {
    if (showGraph) return;
    if (mode === 'related') {
      if ((relatedResult?.hits?.length ?? 0) > 0) setShowGraph(true);
      return;
    }
    if ((pathsResult?.paths?.length ?? 0) > 0) setShowGraph(true);
  }, [mode, relatedResult, pathsResult, showGraph]);

  // When a new connection query runs, default-highlight the first returned path.
  useEffect(() => {
    if (mode !== 'paths') return;
    const p = pathsResult?.paths ?? [];
    if (p.length === 0) {
      setSelectedPathIndex(null);
      return;
    }
    setSelectedPathIndex(0);
  }, [mode, pathsResult?.sourceElementId, pathsResult?.targetElementId, pathsResult?.paths]);

  if (mode === 'related') {
    return (
      <>
        <RelatedResultsSection
          model={model}
          modelName={modelName}
          modelKind={modelKind}
          mode={mode}
          direction={direction}
          relationshipTypes={relationshipTypes}
          relatedResult={relatedResult}
          selection={selection}
          showGraph={showGraph}
          setShowGraph={setShowGraph}
          graphOptions={graphOptions}
          setGraphOptions={setGraphOptions}
          availablePropertyKeys={availablePropertyKeys}
          formatters={formatters}
          onSelectRelationship={onSelectRelationship}
          onSelectElement={onSelectElement}
          onOpenTraceability={onOpenTraceability}
          onOpenSandbox={onOpenSandbox}
          setTooltip={setTooltip}
        />

        <QuickTooltip
          open={Boolean(tooltip)}
          x={tooltip?.x ?? 0}
          y={tooltip?.y ?? 0}
          title={tooltip?.title ?? ''}
          lines={tooltip?.lines ?? []}
          onClose={() => setTooltip(null)}
        />
      </>
    );
  }

  return (
    <>
      <PathsResultsSection
        model={model}
        modelName={modelName}
        modelKind={modelKind}
        mode={mode}
        direction={direction}
        relationshipTypes={relationshipTypes}
        pathsResult={pathsResult}
        selection={selection}
        showGraph={showGraph}
        setShowGraph={setShowGraph}
        graphOptions={graphOptions}
        setGraphOptions={setGraphOptions}
        availablePropertyKeys={availablePropertyKeys}
        selectedPathIndex={selectedPathIndex}
        setSelectedPathIndex={setSelectedPathIndex}
        showAllPathsInMiniGraph={showAllPathsInMiniGraph}
        setShowAllPathsInMiniGraph={setShowAllPathsInMiniGraph}
        formatters={formatters}
        onSelectRelationship={onSelectRelationship}
        onSelectElement={onSelectElement}
        onOpenTraceability={onOpenTraceability}
        onOpenSandbox={onOpenSandbox}
        setTooltip={setTooltip}
      />

      <QuickTooltip
        open={Boolean(tooltip)}
        x={tooltip?.x ?? 0}
        y={tooltip?.y ?? 0}
        title={tooltip?.title ?? ''}
        lines={tooltip?.lines ?? []}
        onClose={() => setTooltip(null)}
      />
    </>
  );
}

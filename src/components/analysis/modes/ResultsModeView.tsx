import type { AnalysisDirection, Model, ModelKind, RelationshipType } from '../../../domain';
import type { PathsBetweenResult, RelatedElementsResult } from '../../../domain';
import type { Selection } from '../../model/selection';

import { AnalysisResultTable } from '../AnalysisResultTable';

export type ResultsModeViewProps = {
  model: Model;
  modelKind: ModelKind;
  mode: 'related' | 'paths';
  relatedResult: RelatedElementsResult | null;
  pathsResult: PathsBetweenResult | null;
  selection: Selection;
  direction: AnalysisDirection;
  relationshipTypes: RelationshipType[];
  onSelectRelationship: (relationshipId: string) => void;
  onSelectElement: (elementId: string) => void;
  onOpenTraceability: (elementId: string) => void;
};

export function ResultsModeView({
  model,
  modelKind,
  mode,
  relatedResult,
  pathsResult,
  selection,
  direction,
  relationshipTypes,
  onSelectRelationship,
  onSelectElement,
  onOpenTraceability,
}: ResultsModeViewProps) {
  return (
    <AnalysisResultTable
      model={model}
      modelKind={modelKind}
      mode={mode}
      relatedResult={relatedResult}
      pathsResult={pathsResult}
      selection={selection}
      direction={direction}
      relationshipTypes={relationshipTypes}
      onSelectRelationship={onSelectRelationship}
      onSelectElement={onSelectElement}
      onOpenTraceability={onOpenTraceability}
    />
  );
}

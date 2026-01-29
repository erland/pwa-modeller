import type { AnalysisDirection, ElementType, Model, ModelKind, RelationshipType } from '../../../domain';

import { TraceabilityExplorer } from '../TraceabilityExplorer';

export type TraceabilityModeViewProps = {
  model: Model;
  modelKind: ModelKind;
  seedId: string;
  direction: AnalysisDirection;
  relationshipTypes: RelationshipType[];
  layers: string[];
  elementTypes: ElementType[];
  expandDepth: number;
  onSelectElement: (elementId: string) => void;
  onSelectRelationship: (relationshipId: string) => void;
};

export function TraceabilityModeView({
  model,
  modelKind,
  seedId,
  direction,
  relationshipTypes,
  layers,
  elementTypes,
  expandDepth,
  onSelectElement,
  onSelectRelationship,
}: TraceabilityModeViewProps) {
  if (!seedId) {
    return (
      <div className="crudSection">
        <div className="crudHeader">
          <div>
            <p className="crudTitle">No start element</p>
            <p className="crudHint">
              Pick a start element in the Query panel (or select an element in the model) and click Run analysis.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <TraceabilityExplorer
      model={model}
      modelKind={modelKind}
      seedId={seedId}
      direction={direction}
      relationshipTypes={relationshipTypes}
      layers={layers}
      elementTypes={elementTypes}
      expandDepth={expandDepth}
      onSelectElement={onSelectElement}
      onSelectRelationship={onSelectRelationship}
    />
  );
}

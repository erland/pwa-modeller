import type { Model, ModelKind } from '../../../domain';
import type { Selection } from '../../model/selection';

import { PortfolioAnalysisView } from '../PortfolioAnalysisView';

export type PortfolioModeViewProps = {
  model: Model;
  modelKind: ModelKind;
  selection: Selection;
  onSelectElement: (elementId: string) => void;
};

export function PortfolioModeView({
  model,
  modelKind,
  selection,
  onSelectElement,
}: PortfolioModeViewProps) {
  return (
    <PortfolioAnalysisView
      model={model}
      modelKind={modelKind}
      selection={selection}
      onSelectElement={onSelectElement}
    />
  );
}

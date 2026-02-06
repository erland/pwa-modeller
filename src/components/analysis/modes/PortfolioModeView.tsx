import type { Model, ModelKind } from '../../../domain';
import type { Selection } from '../../model/selection';
import type { TabularData } from '../../../export';

import { PortfolioAnalysisView } from '../PortfolioAnalysisView';

export type PortfolioModeViewProps = {
  model: Model;
  modelKind: ModelKind;
  selection: Selection;
  onSelectElement: (elementId: string) => void;
  onExportTableChange?: (table: TabularData | null) => void;
};

export function PortfolioModeView({
  model,
  modelKind,
  selection,
  onSelectElement,
  onExportTableChange,
}: PortfolioModeViewProps) {
  return (
    <PortfolioAnalysisView
      model={model}
      modelKind={modelKind}
      selection={selection}
      onSelectElement={onSelectElement}
      onExportTableChange={onExportTableChange}
    />
  );
}

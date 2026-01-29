import type { Model, MatrixMetricId } from '../../../domain';
import type { Dispatch, SetStateAction } from 'react';
import { useState } from 'react';

import type { MatrixWorkspaceCellDialogInfo } from '../workspace/useMatrixWorkspaceState';

import { RelationshipMatrixCellDialog } from '../RelationshipMatrixCellDialog';
import { RelationshipMatrixTable } from '../RelationshipMatrixTable';

export type MatrixModeViewProps = {
  model: Model;
  matrixState: {
    preferences: {
      cellMetricId: 'off' | MatrixMetricId;
      weightPresets: { id: string; label: string }[];
      weightPresetId: string;
      weightsByRelationshipType: Record<string, number>;
      highlightMissing: boolean;
      heatmapEnabled: boolean;
      hideEmpty: boolean;
    };
  };
  matrixActions: {
    preferences: {
      setCellMetricId: Dispatch<SetStateAction<'off' | MatrixMetricId>>;
      setWeightsByRelationshipType: (
        next:
          | Record<string, number>
          | ((prev: Record<string, number>) => Record<string, number>)
      ) => void;
      applyWeightPreset: (presetId: string) => void;
      onToggleHighlightMissing: () => void;
      setHeatmapEnabled: Dispatch<SetStateAction<boolean>>;
      setHideEmpty: Dispatch<SetStateAction<boolean>>;
    };
  };
  matrixDerived: {
    result: any | null;
    cellValues: any;
    relationshipTypesForWeights: string[];
  };
};

export function MatrixModeView({
  model,
  matrixState,
  matrixActions,
  matrixDerived,
}: MatrixModeViewProps) {
  const [matrixCellDialog, setMatrixCellDialog] = useState<MatrixWorkspaceCellDialogInfo | null>(null);

  if (!matrixDerived.result) return null;

  return (
    <>
      <RelationshipMatrixTable
        modelName={model.metadata?.name || 'model'}
        result={matrixDerived.result}
        cellMetricId={matrixState.preferences.cellMetricId}
        onChangeCellMetricId={(v) => matrixActions.preferences.setCellMetricId(v)}
        weightsByRelationshipType={matrixState.preferences.weightsByRelationshipType}
        onChangeRelationshipTypeWeight={(relationshipType, weight) =>
          matrixActions.preferences.setWeightsByRelationshipType((prev) => ({
            ...prev,
            [relationshipType]: weight,
          }))
        }
        weightPresets={matrixState.preferences.weightPresets}
        weightPresetId={matrixState.preferences.weightPresetId}
        onChangeWeightPresetId={(presetId) => matrixActions.preferences.applyWeightPreset(presetId)}
        relationshipTypesForWeights={matrixDerived.relationshipTypesForWeights}
        cellValues={matrixDerived.cellValues}
        highlightMissing={matrixState.preferences.highlightMissing}
        onToggleHighlightMissing={matrixActions.preferences.onToggleHighlightMissing}
        heatmapEnabled={matrixState.preferences.heatmapEnabled}
        onChangeHeatmapEnabled={(v) => matrixActions.preferences.setHeatmapEnabled(v)}
        hideEmpty={matrixState.preferences.hideEmpty}
        onChangeHideEmpty={(v) => matrixActions.preferences.setHideEmpty(v)}
        onOpenCell={(info) => setMatrixCellDialog(info)}
      />

      {matrixCellDialog ? (
        <RelationshipMatrixCellDialog
          isOpen={Boolean(matrixCellDialog)}
          onClose={() => setMatrixCellDialog(null)}
          model={model}
          cell={matrixCellDialog}
        />
      ) : null}
    </>
  );
}

import type { Model } from '../../../domain';

import type { AnalysisMode } from '../AnalysisQueryPanel';

import { ElementPickerRow } from './ElementPickerRow';

type Props = {
  model: Model;
  modelName: string;

  mode: AnalysisMode;
  onChangeMode: (mode: AnalysisMode) => void;

  draftStartId: string;
  onChangeDraftStartId: (id: string) => void;
  draftSourceId: string;
  onChangeDraftSourceId: (id: string) => void;
  draftTargetId: string;
  onChangeDraftTargetId: (id: string) => void;

  onOpenChooser: (which: 'start' | 'source' | 'target') => void;

  canUseSelection: boolean;
  onUseSelection: (which: 'start' | 'source' | 'target') => void;

  canRun: boolean;
  onRun: () => void;
};

export function QueryToolbar({
  model,
  modelName,
  mode,
  onChangeMode,
  draftStartId,
  onChangeDraftStartId,
  draftSourceId,
  onChangeDraftSourceId,
  draftTargetId,
  onChangeDraftTargetId,
  onOpenChooser,
  canUseSelection,
  onUseSelection,
  canRun,
  onRun
}: Props) {
  return (
    <div className="crudHeader">
      <div>
        <p className="crudTitle">Query</p>
        <p className="crudHint">Pick elements in “{modelName}” and run an analysis.</p>
      </div>

      <div className="toolbar" aria-label="Analysis query toolbar">
        <div className="toolbarGroup">
          <label htmlFor="analysis-mode">Analysis</label>
          <select
            id="analysis-mode"
            className="selectInput"
            value={mode}
            onChange={(e) => onChangeMode(e.currentTarget.value as AnalysisMode)}
          >
            <option value="related">Related elements</option>
            <option value="paths">Connection between two</option>
          </select>
        </div>

        {mode === 'related' ? (
          <ElementPickerRow
            which="start"
            label="Start element"
            inputId="analysis-start"
            model={model}
            valueId={draftStartId}
            canUseSelection={canUseSelection}
            onUseSelection={onUseSelection}
            onOpenChooser={onOpenChooser}
            onClear={() => onChangeDraftStartId('')}
          />
        ) : (
          <>
            <ElementPickerRow
              which="source"
              label="Source"
              inputId="analysis-source"
              model={model}
              valueId={draftSourceId}
              canUseSelection={canUseSelection}
              onUseSelection={onUseSelection}
              onOpenChooser={onOpenChooser}
              onClear={() => onChangeDraftSourceId('')}
            />

            <ElementPickerRow
              which="target"
              label="Target"
              inputId="analysis-target"
              model={model}
              valueId={draftTargetId}
              canUseSelection={canUseSelection}
              onUseSelection={onUseSelection}
              onOpenChooser={onOpenChooser}
              onClear={() => onChangeDraftTargetId('')}
            />
          </>
        )}

        <div className="toolbarGroup" style={{ minWidth: 0 }}>
          <label style={{ visibility: 'hidden' }} aria-hidden="true">
            Run
          </label>
          <button type="button" className="shellButton" disabled={!canRun} onClick={onRun}>
            Run analysis
          </button>
        </div>
      </div>
    </div>
  );
}

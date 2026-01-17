import { useMemo } from 'react';

import type { Element, Model } from '../../domain';

export type AnalysisMode = 'related' | 'paths';

type Props = {
  model: Model;
  elements: Element[];
  mode: AnalysisMode;
  onChangeMode: (mode: AnalysisMode) => void;

  draftStartId: string;
  onChangeDraftStartId: (id: string) => void;

  draftSourceId: string;
  onChangeDraftSourceId: (id: string) => void;

  draftTargetId: string;
  onChangeDraftTargetId: (id: string) => void;

  canUseSelection: boolean;
  onUseSelection: (which: 'start' | 'source' | 'target') => void;

  canRun: boolean;
  onRun: () => void;
};

function labelForElement(e: Element): string {
  const type = e.type ? String(e.type) : 'Unknown';
  const layer = e.layer ? String(e.layer) : '';
  const suffix = layer ? ` (${type}, ${layer})` : ` (${type})`;
  return `${e.name || '(unnamed)'}${suffix}`;
}

export function AnalysisQueryPanel({
  model,
  elements,
  mode,
  onChangeMode,
  draftStartId,
  onChangeDraftStartId,
  draftSourceId,
  onChangeDraftSourceId,
  draftTargetId,
  onChangeDraftTargetId,
  canUseSelection,
  onUseSelection,
  canRun,
  onRun
}: Props) {
  const options = useMemo(() => {
    // Keep deterministic order, but build labels once.
    return elements.map((e) => ({ id: e.id, label: labelForElement(e) }));
  }, [elements]);

  const modelName = model.metadata?.name || 'Model';

  return (
    <section className="crudSection" aria-label="Analysis query">
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
            <div className="toolbarGroup">
              <label htmlFor="analysis-start">Start element</label>
              <select
                id="analysis-start"
                className="selectInput"
                value={draftStartId}
                onChange={(e) => onChangeDraftStartId(e.currentTarget.value)}
              >
                <option value="">Select…</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button
                  type="button"
                  className="miniLinkButton"
                  disabled={!canUseSelection}
                  onClick={() => onUseSelection('start')}
                >
                  Use current selection
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="toolbarGroup">
                <label htmlFor="analysis-source">Source</label>
                <select
                  id="analysis-source"
                  className="selectInput"
                  value={draftSourceId}
                  onChange={(e) => onChangeDraftSourceId(e.currentTarget.value)}
                >
                  <option value="">Select…</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <button
                    type="button"
                    className="miniLinkButton"
                    disabled={!canUseSelection}
                    onClick={() => onUseSelection('source')}
                  >
                    Use current selection
                  </button>
                </div>
              </div>

              <div className="toolbarGroup">
                <label htmlFor="analysis-target">Target</label>
                <select
                  id="analysis-target"
                  className="selectInput"
                  value={draftTargetId}
                  onChange={(e) => onChangeDraftTargetId(e.currentTarget.value)}
                >
                  <option value="">Select…</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <button
                    type="button"
                    className="miniLinkButton"
                    disabled={!canUseSelection}
                    onClick={() => onUseSelection('target')}
                  >
                    Use current selection
                  </button>
                </div>
              </div>
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
    </section>
  );
}

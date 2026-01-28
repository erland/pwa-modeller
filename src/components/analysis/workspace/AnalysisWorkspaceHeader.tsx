import type { AnalysisMode } from '../AnalysisQueryPanel';

export function AnalysisWorkspaceHeader({
  mode,
  onChangeMode,
  canOpenTraceability,
  onOpenTraceability,
}: {
  mode: AnalysisMode;
  onChangeMode: (mode: AnalysisMode) => void;
  canOpenTraceability: boolean;
  onOpenTraceability: () => void;
}) {
  return (
    <div className="workspaceHeader">
      <h1 className="workspaceTitle">Analysis</h1>
      <div className="workspaceTabs" role="tablist" aria-label="Analysis tabs">
        <button
          type="button"
          className={`tabButton ${mode === 'related' ? 'isActive' : ''}`}
          role="tab"
          aria-selected={mode === 'related'}
          onClick={() => onChangeMode('related')}
        >
          Related elements
        </button>
        <button
          type="button"
          className={`tabButton ${mode === 'paths' ? 'isActive' : ''}`}
          role="tab"
          aria-selected={mode === 'paths'}
          onClick={() => onChangeMode('paths')}
        >
          Connection between two
        </button>
        <button
          type="button"
          className={`tabButton ${mode === 'traceability' ? 'isActive' : ''}`}
          role="tab"
          aria-selected={mode === 'traceability'}
          onClick={() => onChangeMode('traceability')}
        >
          Traceability explorer
        </button>
        <button
          type="button"
          className={`tabButton ${mode === 'matrix' ? 'isActive' : ''}`}
          role="tab"
          aria-selected={mode === 'matrix'}
          onClick={() => onChangeMode('matrix')}
        >
          Matrix
        </button>
        <button
          type="button"
          className={`tabButton ${mode === 'portfolio' ? 'isActive' : ''}`}
          role="tab"
          aria-selected={mode === 'portfolio'}
          onClick={() => onChangeMode('portfolio')}
        >
          Portfolio
        </button>
      </div>
      <div className="rowActions">
        <button
          type="button"
          className="miniLinkButton"
          onClick={onOpenTraceability}
          disabled={!canOpenTraceability}
          aria-disabled={!canOpenTraceability}
          title="Open Traceability Explorer from the currently selected element"
        >
          Open traceability
        </button>
      </div>
    </div>
  );
}

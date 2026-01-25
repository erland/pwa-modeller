import '../../styles/crud.css';

export function PortfolioWorkspace() {
  return (
    <div className="workspace" aria-label="Portfolio analysis workspace">
      <div className="workspaceHeader">
        <h1 className="workspaceTitle">Portfolio analysis</h1>
      </div>

      <div className="canvasPlaceholder" role="region" aria-label="Portfolio analysis placeholder">
        <div className="canvasPlaceholderInner">
          <p className="canvasTitle">Portfolio analysis is coming next</p>
          <p className="canvasHint">
            Step 1 sets up routing + a UI shell. Next steps will add population filters, metrics, sorting, exports, and presets.
          </p>
        </div>
      </div>
    </div>
  );
}

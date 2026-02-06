import type { ReactNode } from 'react';

import type { SandboxUiState } from '../workspace/controller/sandboxTypes';

export function SandboxToolbar({
  nodesCount,
  ui,
  edgeOverflow,
  edgeCapDismissed,
  onDismissWarnings,
  onSaveAsDiagram,
  onClear,
  onUndoLastInsert,
  onAutoLayout,
  onFitToContent,
  onResetView,
  onSetPersistEnabled,
  overlayButton,
  canAddSelected,
  canRemoveSelected,
  canAddRelated,
  canInsertIntermediates,
  addSelectedButton,
  removeSelectedButton,
  addRelatedButton,
  insertIntermediatesButton,
}: {
  nodesCount: number;
  ui: SandboxUiState;
  edgeOverflow: number;
  edgeCapDismissed: boolean;
  onDismissWarnings: () => void;
  onSaveAsDiagram: () => void;
  onClear: () => void;
  onUndoLastInsert: () => void;
  onAutoLayout: () => void;
  onFitToContent: () => void;
  onResetView: () => void;
  onSetPersistEnabled: (enabled: boolean) => void;
  overlayButton?: ReactNode;
  canAddSelected: boolean;
  canRemoveSelected: boolean;
  canAddRelated: boolean;
  canInsertIntermediates: boolean;
  addSelectedButton: ReactNode;
  removeSelectedButton: ReactNode;
  addRelatedButton: ReactNode;
  insertIntermediatesButton: ReactNode;
}) {
  const showEdgeCapWarning = edgeOverflow > 0 && !edgeCapDismissed;

  return (
    <>
      <div className="crudHeader">
        <div>
          <p className="crudTitle">Sandbox</p>
          <p className="crudHint">
            Drag elements from the Model Navigator into the canvas, or use the buttons to add and remove the current
            selection.
          </p>
        </div>
        <div className="rowActions">
          <button
            type="button"
            className="miniLinkButton"
            onClick={onSaveAsDiagram}
            disabled={!nodesCount}
            aria-disabled={!nodesCount}
            title="Create a new model diagram from the current sandbox layout"
          >
            Save as diagram…
          </button>
          <button
            type="button"
            className="miniLinkButton"
            onClick={onClear}
            disabled={!nodesCount}
            aria-disabled={!nodesCount}
            title="Clear all sandbox nodes"
          >
            Clear
          </button>
          {ui.lastInsertedElementIds.length > 0 ? (
            <button
              type="button"
              className="miniLinkButton"
              onClick={onUndoLastInsert}
              title="Undo the last insertion batch"
            >
              Undo
            </button>
          ) : null}
        </div>
      </div>

      {ui.warning || showEdgeCapWarning ? (
        <div
          role="alert"
          style={{
            marginTop: 10,
            padding: '10px 12px',
            border: '1px solid var(--border-1)',
            borderRadius: 6,
            background: 'rgba(255, 204, 0, 0.12)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ fontSize: 12, lineHeight: 1.4 }}>
            {ui.warning ? <div>{ui.warning}</div> : null}
            {showEdgeCapWarning ? (
              <div>
                Relationship rendering capped at {ui.maxEdges}. Hidden {edgeOverflow} relationship(s).
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="miniLinkButton"
            onClick={onDismissWarnings}
            title="Dismiss warnings"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {ui.lastInsertedElementIds.length > 0 ? (
        <div
          role="status"
          style={{
            marginTop: 10,
            padding: '8px 12px',
            border: '1px solid var(--border-1)',
            borderRadius: 6,
            background: 'rgba(0, 128, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ fontSize: 12, lineHeight: 1.4 }}>Inserted {ui.lastInsertedElementIds.length} element(s).</div>
          <button type="button" className="miniLinkButton" onClick={onUndoLastInsert} title="Undo last insert">
            Undo
          </button>
        </div>
      ) : null}

      <div className="toolbar" style={{ marginTop: 10 }}>
        <div className="toolbarGroup" style={{ minWidth: 220 }}>
          <label>Layout</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="miniLinkButton"
              onClick={onAutoLayout}
              disabled={!nodesCount}
              aria-disabled={!nodesCount}
              title="Auto layout sandbox nodes"
            >
              Auto layout
            </button>
            <button
              type="button"
              className="miniLinkButton"
              onClick={onFitToContent}
              disabled={!nodesCount}
              aria-disabled={!nodesCount}
              title="Fit the canvas to the current sandbox content"
            >
              Fit to content
            </button>
            <button type="button" className="miniLinkButton" onClick={onResetView} title="Reset canvas view">
              Reset view
            </button>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.9 }}>
            <input
              type="checkbox"
              checked={ui.persistEnabled}
              onChange={(e) => onSetPersistEnabled(e.currentTarget.checked)}
            />
            <span>Persist sandbox in session</span>
          </label>
          <p className="crudHint" style={{ margin: 0 }}>
            Caps: {ui.maxNodes} nodes / {ui.maxEdges} relationships
          </p>
        </div>
      </div>

      <div className="toolbar" style={{ marginTop: 10 }}>
        <div className="toolbarGroup" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ display: 'none' }} aria-hidden>
            {canAddSelected}
            {canRemoveSelected}
            {canAddRelated}
            {canInsertIntermediates}
          </span>
          {addSelectedButton}
          {removeSelectedButton}
          {overlayButton ?? null}
          {addRelatedButton}
          {insertIntermediatesButton}
        </div>
      </div>
    </>
  );
}

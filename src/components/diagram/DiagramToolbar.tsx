import { useMemo, useState } from 'react';

import type { AlignMode, AutoLayoutOptions, DistributeMode, Model, SameSizeMode, View } from '../../domain';

import type { Selection } from '../model/selection';

import type { ToolMode } from './hooks/useDiagramToolState';

import { ArchimateToolbar } from './toolbar/ArchimateToolbar';
import { UmlToolbar } from './toolbar/UmlToolbar';
import { BpmnToolbar } from './toolbar/BpmnToolbar';
import { AlignDialog } from './dialogs/AlignDialog';
import { AutoLayoutDialog } from './dialogs/AutoLayoutDialog';

export type DiagramToolbarProps = {
  model: Model;
  activeViewId: string | null;
  activeView: View | null;

  selection: Selection;

  nodesCount: number;

  toolMode: ToolMode;
  setToolMode: (mode: ToolMode) => void;

  zoom: number;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
  fitToView: () => void;

  canExportImage: boolean;
  onExportImage: () => void;
  onAutoLayout: (overrides?: Partial<AutoLayoutOptions>) => void;
  onAlignSelection: (mode: AlignMode) => void;
  onDistributeSelection: (mode: DistributeMode) => void;
  onSameSizeSelection: (mode: SameSizeMode) => void;
  onFitToTextSelection: () => void;
  onAddAndJunction: () => void;
  onAddOrJunction: () => void;

  beginPlaceExistingElement: (elementId: string) => void;
  findFolderContainingView: (m: Model, viewId: string) => string | undefined;
  onSelect: (sel: Selection) => void;
};

export function DiagramToolbar({
  model,
  activeViewId,
  activeView,
  selection,
  nodesCount,
  toolMode,
  setToolMode,
  zoom,
  zoomIn,
  zoomOut,
  zoomReset,
  fitToView,
  canExportImage,
  onExportImage,
  onAutoLayout,
  onAlignSelection,
  onDistributeSelection,
  onSameSizeSelection,
  onFitToTextSelection,
  onAddAndJunction,
  onAddOrJunction,
  beginPlaceExistingElement,
  findFolderContainingView,
  onSelect,
}: DiagramToolbarProps) {
  const hasActiveView = Boolean(activeViewId && activeView);

  const [alignDialogOpen, setAlignDialogOpen] = useState(false);

  const [autoLayoutDialogOpen, setAutoLayoutDialogOpen] = useState(false);
  const [autoLayoutSettingsByKind, setAutoLayoutSettingsByKind] = useState<Record<string, AutoLayoutOptions>>({
    archimate: { scope: 'all', direction: 'RIGHT', spacing: 80, edgeRouting: 'POLYLINE', respectLocked: true },
    bpmn: { scope: 'all', direction: 'RIGHT', spacing: 100, edgeRouting: 'ORTHOGONAL', respectLocked: true },
    uml: { scope: 'all', direction: 'RIGHT', spacing: 110, edgeRouting: 'ORTHOGONAL', respectLocked: true },
  });

  const selectedNodeCount = useMemo(() => {
    if (!activeViewId) return 0;
    if (selection.kind === 'viewNodes' && selection.viewId === activeViewId) return selection.elementIds.length;
    if (selection.kind === 'viewNode' && selection.viewId === activeViewId) return 1;
    return 0;
  }, [activeViewId, selection]);

  return (
    <>
      <div aria-label="Diagram toolbar" className="diagramToolbar">
        {/* Row 1: generic node objects/tools */}
        <div className="diagramToolbarRow" aria-label="Diagram tools row">
          <div className="diagramToolbarTools" role="group" aria-label="Diagram tools">
            <button
              type="button"
              className={'shellButton' + (toolMode === 'select' ? ' isActive' : '')}
              onClick={() => setToolMode('select')}
              disabled={!hasActiveView}
              title="Select tool"
            >
              Select
            </button>
            <button
              type="button"
              className={'shellButton' + (toolMode === 'addNote' ? ' isActive' : '')}
              onClick={() => setToolMode('addNote')}
              disabled={!hasActiveView}
              title="Place a Note (click to drop)"
            >
              Note
            </button>
            <button
              type="button"
              className={'shellButton' + (toolMode === 'addLabel' ? ' isActive' : '')}
              onClick={() => setToolMode('addLabel')}
              disabled={!hasActiveView}
              title="Place a Label (click to drop)"
            >
              Label
            </button>
            <button
              type="button"
              className={'shellButton' + (toolMode === 'addDivider' ? ' isActive' : '')}
              onClick={() => setToolMode('addDivider')}
              disabled={!hasActiveView}
              title="Place a Divider line (drag to size)"
            >
              Divider
            </button>
            <button
              type="button"
              className={'shellButton' + (toolMode === 'addGroupBox' ? ' isActive' : '')}
              onClick={() => setToolMode('addGroupBox')}
              disabled={!hasActiveView}
              title="Place a Group box (drag to size)"
            >
              Group
            </button>
          </div>
        </div>

        {/* Row 2: notation specific palettes */}
        <div className="diagramToolbarRow" aria-label="Diagram palette row">
          <ArchimateToolbar
            model={model}
            activeViewId={activeViewId}
            activeView={activeView}
            hasActiveView={hasActiveView}
            setToolMode={setToolMode}
            beginPlaceExistingElement={beginPlaceExistingElement}
            findFolderContainingView={findFolderContainingView}
            onSelect={onSelect}
            onAddAndJunction={onAddAndJunction}
            onAddOrJunction={onAddOrJunction}
          />

          <UmlToolbar
            model={model}
            activeViewId={activeViewId}
            activeView={activeView}
            hasActiveView={hasActiveView}
            setToolMode={setToolMode}
            beginPlaceExistingElement={beginPlaceExistingElement}
            findFolderContainingView={findFolderContainingView}
            onSelect={onSelect}
          />

          <BpmnToolbar
            model={model}
            activeViewId={activeViewId}
            activeView={activeView}
            hasActiveView={hasActiveView}
            setToolMode={setToolMode}
            beginPlaceExistingElement={beginPlaceExistingElement}
            findFolderContainingView={findFolderContainingView}
            onSelect={onSelect}
          />
        </div>

        {/* Row 3: zoom/fit/export */}
        <div className="diagramToolbarRow" aria-label="Diagram view actions row">
          <div className="diagramToolbarTools" role="group" aria-label="Diagram view actions">
            <button type="button" onClick={zoomIn} aria-label="Zoom in" disabled={!activeView}>
              +
            </button>
            <span className="diagramToolbarZoom">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={zoomOut} aria-label="Zoom out" disabled={!activeView}>
              -
            </button>
            <button type="button" onClick={zoomReset} aria-label="Reset zoom" disabled={!activeView}>
              100%
            </button>
            <button type="button" onClick={fitToView} aria-label="Fit to view" disabled={!activeView || nodesCount === 0}>
              Fit
            </button>

            <button
              type="button"
              onClick={onFitToTextSelection}
              className="shellButton"
              disabled={!hasActiveView || selectedNodeCount < 1 || activeView?.kind !== 'archimate'}
              title="Resize selected nodes so their text fits"
            >
              Fit Text
            </button>

            <button
              type="button"
              onClick={() => setAlignDialogOpen(true)}
              className="shellButton"
              disabled={!hasActiveView || selectedNodeCount < 2}
              title="Arrange selected nodes"
            >
              Arrange
            </button>

            <button
              type="button"
              onClick={() => setAutoLayoutDialogOpen(true)}
              className="shellButton"
              disabled={!hasActiveView}
              title={`Auto layout this view${activeView?.kind ? ` (${activeView.kind.toUpperCase()})` : ''}`}
            >
              Auto Layout
            </button>

            <button type="button" onClick={onExportImage} className="shellButton" disabled={!canExportImage}>
              Export as Image
            </button>
          </div>
        </div>
      </div>

      <AlignDialog
        isOpen={alignDialogOpen}
        onClose={() => setAlignDialogOpen(false)}
        selectedCount={selectedNodeCount}
        onAlign={(mode) => {
          onAlignSelection(mode);
          setAlignDialogOpen(false);
        }}
        onSameSize={(mode) => {
          onSameSizeSelection(mode);
          setAlignDialogOpen(false);
        }}
        onDistribute={(mode) => {
          onDistributeSelection(mode);
          setAlignDialogOpen(false);
        }}
      />

      <AutoLayoutDialog
        isOpen={autoLayoutDialogOpen}
        onClose={() => setAutoLayoutDialogOpen(false)}
        viewKind={activeView?.kind ?? null}
        hasSelection={selectedNodeCount > 0}
        initialOptions={autoLayoutSettingsByKind[activeView?.kind ?? 'archimate'] ?? autoLayoutSettingsByKind.archimate}
        onRun={(opts) => {
          const kindKey = activeView?.kind ?? 'archimate';
          setAutoLayoutSettingsByKind((prev) => ({ ...prev, [kindKey]: opts }));
          setAutoLayoutDialogOpen(false);
          onAutoLayout(opts);
        }}
      />
    </>
  );
}

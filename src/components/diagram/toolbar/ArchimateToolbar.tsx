import { useMemo, useState } from 'react';

import type { ElementType, Model, View } from '../../../domain';

import { CreateElementDialog } from '../../model/navigator/dialogs/CreateElementDialog';
import type { Selection } from '../../model/selection';

import type { ToolMode } from '../hooks/useDiagramToolState';

type Props = {
  model: Model;
  activeViewId: string | null;
  activeView: View | null;
  hasActiveView: boolean;

  setToolMode: (mode: ToolMode) => void;

  beginPlaceExistingElement: (elementId: string) => void;
  findFolderContainingView: (m: Model, viewId: string) => string | undefined;
  onSelect: (sel: Selection) => void;

  onAddAndJunction: () => void;
  onAddOrJunction: () => void;
};

export function ArchimateToolbar({
  model,
  activeViewId,
  activeView,
  hasActiveView,
  setToolMode,
  beginPlaceExistingElement,
  findFolderContainingView,
  onSelect,
  onAddAndJunction,
  onAddOrJunction,
}: Props) {
  const [archimatePaletteDialog, setArchimatePaletteDialog] = useState<{ initialTypeId?: ElementType } | null>(null);

  const rootFolderId = useMemo(() => {
    // The model always has a root folder, but keep a defensive fallback.
    return (
      Object.values(model.folders).find((f) => f.kind === 'root')?.id ??
      Object.values(model.folders)[0]?.id ??
      ''
    );
  }, [model.folders]);

  const paletteTargetFolderId = useMemo(() => {
    if (!activeViewId) return rootFolderId;
    const folderId = findFolderContainingView(model, activeViewId);
    return folderId ?? rootFolderId;
  }, [activeViewId, findFolderContainingView, model, rootFolderId]);

  if (activeView?.kind !== 'archimate') return null;

  return (
    <>
      <div className="diagramToolbarTools" role="group" aria-label="ArchiMate palette">
        <button
          type="button"
          className="shellButton"
          disabled={!hasActiveView}
          onClick={() => {
            setToolMode('select');
            setArchimatePaletteDialog({});
          }}
          title="Create an ArchiMate element, then click to place it in the view"
        >
          Element
        </button>

        <span className="diagramToolbarDivider" aria-hidden="true" />

        <button
          className="shellButton"
          type="button"
          disabled={!hasActiveView}
          onClick={onAddAndJunction}
          title="Place an AND Junction"
        >
          +AND
        </button>
        <button
          className="shellButton"
          type="button"
          disabled={!hasActiveView}
          onClick={onAddOrJunction}
          title="Place an OR Junction"
        >
          +OR
        </button>
      </div>

      {/* ArchiMate palette: create element first, then click to place in the view */}
      <CreateElementDialog
        isOpen={archimatePaletteDialog !== null}
        targetFolderId={paletteTargetFolderId}
        kind="archimate"
        initialTypeId={archimatePaletteDialog?.initialTypeId}
        selectAfterCreate={false}
        onCreated={(elementId) => {
          beginPlaceExistingElement(elementId);
        }}
        onClose={() => setArchimatePaletteDialog(null)}
        onSelect={onSelect}
      />
    </>
  );
}

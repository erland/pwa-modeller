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
};

export function UmlToolbar({
  model,
  activeViewId,
  activeView,
  hasActiveView,
  setToolMode,
  beginPlaceExistingElement,
  findFolderContainingView,
  onSelect,
}: Props) {
  const [umlPaletteDialog, setUmlPaletteDialog] = useState<{ initialTypeId: ElementType } | null>(null);

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

  if (activeView?.kind !== 'uml') return null;

  return (
    <>
      <div className="diagramToolbarTools" role="group" aria-label="UML palette">
        <button
          type="button"
          className="shellButton"
          onClick={() => {
            setToolMode('select');
            setUmlPaletteDialog({ initialTypeId: 'uml.class' as ElementType });
          }}
          disabled={!hasActiveView}
          title="Place a UML Class (click to drop)"
        >
          Class
        </button>
        <button
          type="button"
          className="shellButton"
          onClick={() => {
            setToolMode('select');
            setUmlPaletteDialog({ initialTypeId: 'uml.interface' as ElementType });
          }}
          disabled={!hasActiveView}
          title="Place a UML Interface (click to drop)"
        >
          Interface
        </button>
        <button
          type="button"
          className="shellButton"
          onClick={() => {
            setToolMode('select');
            setUmlPaletteDialog({ initialTypeId: 'uml.enum' as ElementType });
          }}
          disabled={!hasActiveView}
          title="Place a UML Enum (click to drop)"
        >
          Enum
        </button>
        <button
          type="button"
          className="shellButton"
          onClick={() => {
            setToolMode('select');
            setUmlPaletteDialog({ initialTypeId: 'uml.package' as ElementType });
          }}
          disabled={!hasActiveView}
          title="Place a UML Package (click to drop)"
        >
          Package
        </button>
        <button
          type="button"
          className="shellButton"
          onClick={() => {
            setToolMode('select');
            setUmlPaletteDialog({ initialTypeId: 'uml.note' as ElementType });
          }}
          disabled={!hasActiveView}
          title="Place a UML Note (click to drop)"
        >
          Note
        </button>
      </div>

      {/* UML palette: create element first, then click to place in the view */}
      <CreateElementDialog
        isOpen={umlPaletteDialog !== null}
        targetFolderId={paletteTargetFolderId}
        kind="uml"
        initialTypeId={umlPaletteDialog?.initialTypeId}
        selectAfterCreate={false}
        onCreated={(elementId) => {
          beginPlaceExistingElement(elementId);
        }}
        onClose={() => setUmlPaletteDialog(null)}
        onSelect={onSelect}
      />
    </>
  );
}

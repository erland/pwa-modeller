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

export function BpmnToolbar({
  model,
  activeViewId,
  activeView,
  hasActiveView,
  setToolMode,
  beginPlaceExistingElement,
  findFolderContainingView,
  onSelect,
}: Props) {
  const [bpmnPaletteDialog, setBpmnPaletteDialog] = useState<{ initialTypeId: ElementType } | null>(null);

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

  if (activeView?.kind !== 'bpmn') return null;

  return (
    <>
      <div className="diagramToolbarTools" role="group" aria-label="BPMN palette">
        <button
          type="button"
          className="shellButton"
          onClick={() => {
            setToolMode('select');
            setBpmnPaletteDialog({ initialTypeId: 'bpmn.pool' as ElementType });
          }}
          disabled={!hasActiveView}
          title="Place a Pool/Participant (container)"
        >
          Pool
        </button>
        <button
          type="button"
          className="shellButton"
          onClick={() => {
            setToolMode('select');
            setBpmnPaletteDialog({ initialTypeId: 'bpmn.lane' as ElementType });
          }}
          disabled={!hasActiveView}
          title="Place a Lane (container)"
        >
          Lane
        </button>
        <button
          type="button"
          className="shellButton"
          onClick={() => {
            setToolMode('select');
            setBpmnPaletteDialog({ initialTypeId: 'bpmn.task' as ElementType });
          }}
          disabled={!hasActiveView}
          title="Place a BPMN Task (click to drop)"
        >
          Task
        </button>
        <button
          type="button"
          className="shellButton"
          onClick={() => {
            setToolMode('select');
            setBpmnPaletteDialog({ initialTypeId: 'bpmn.startEvent' as ElementType });
          }}
          disabled={!hasActiveView}
          title="Place a BPMN Start Event (click to drop)"
        >
          Start
        </button>
        <button
          type="button"
          className="shellButton"
          onClick={() => {
            setToolMode('select');
            setBpmnPaletteDialog({ initialTypeId: 'bpmn.endEvent' as ElementType });
          }}
          disabled={!hasActiveView}
          title="Place a BPMN End Event (click to drop)"
        >
          End
        </button>
        <button
          type="button"
          className="shellButton"
          onClick={() => {
            setToolMode('select');
            setBpmnPaletteDialog({ initialTypeId: 'bpmn.gatewayExclusive' as ElementType });
          }}
          disabled={!hasActiveView}
          title="Place an Exclusive Gateway (XOR) (click to drop)"
        >
          XOR
        </button>
      </div>

      {/* BPMN palette: create element first, then click to place in the view */}
      <CreateElementDialog
        isOpen={bpmnPaletteDialog !== null}
        targetFolderId={paletteTargetFolderId}
        kind="bpmn"
        initialTypeId={bpmnPaletteDialog?.initialTypeId}
        selectAfterCreate={false}
        onCreated={(elementId) => {
          beginPlaceExistingElement(elementId);
        }}
        onClose={() => setBpmnPaletteDialog(null)}
        onSelect={onSelect}
      />
    </>
  );
}

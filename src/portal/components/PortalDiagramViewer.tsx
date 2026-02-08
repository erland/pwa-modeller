import { useCallback, useMemo, useState } from 'react';
import type * as React from 'react';
import type { ElementType, Model, View } from '../../domain';
import { getNotation } from '../../notations';
import type { Selection } from '../../components/model/selection';

import { useDiagramNodes } from '../../components/diagram/hooks/useDiagramNodes';
import { useDiagramViewport } from '../../components/diagram/hooks/useDiagramViewport';
import { useDiagramConnections } from '../../components/diagram/hooks/useDiagramConnections';
import { useElementBgVar } from '../../components/diagram/hooks/useElementBgVar';
import { DiagramNodesLayer } from '../../components/diagram/layers/DiagramNodesLayer';
import { DiagramRelationshipsLayer } from '../../components/diagram/layers/DiagramRelationshipsLayer';

type Props = {
  model: Model;
  view: View;
  viewId: string;
  initialSelection?: Selection;
};

/**
 * Read-only diagram viewer for Portal mode.
 *
 * Uses the existing diagram layers (nodes + relationships) but disables all
 * mutation/drag/link creation behavior.
 */
export function PortalDiagramViewer({ model, view, viewId, initialSelection }: Props) {
  const [selection, setSelection] = useState<Selection>(initialSelection ?? { kind: 'none' });

  const notation = useMemo(() => getNotation(view.kind), [view.kind]);
  const { nodes, bounds, surfacePadding, surfaceWidthModel, surfaceHeightModel } = useDiagramNodes(view);

  const viewport = useDiagramViewport({
    activeViewId: viewId,
    activeView: view,
    bounds,
    hasNodes: nodes.length > 0,
    surfacePadding,
  });

  const { connectionRenderItems } = useDiagramConnections({ model, activeView: view, nodes });

  const { getElementBgVar } = useElementBgVar();

  const clearSelectionIfBackground = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Only clear if user clicked directly on the surface background.
    if (e.target !== e.currentTarget) return;
    setSelection({ kind: 'none' });
  }, []);

  // Read-only: disable all gesture handlers that would mutate the model.
  const noop = useCallback(() => void 0, []);
  const noopHoverTarget = useCallback(() => void 0, []);
  const noopStartLinkDrag = useCallback(() => void 0, []);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <button type="button" className="shellButton" onClick={viewport.zoomOut} title="Zoom out">
          −
        </button>
        <button type="button" className="shellButton" onClick={viewport.zoomIn} title="Zoom in">
          +
        </button>
        <button type="button" className="shellButton" onClick={viewport.zoomReset} title="Reset zoom">
          100%
        </button>
        <button type="button" className="shellButton" onClick={viewport.fitToView} title="Fit view">
          Fit
        </button>
        <div style={{ opacity: 0.75, marginLeft: 6 }}>
          {Math.round(viewport.zoom * 100)}%
          <span style={{ marginLeft: 10, opacity: 0.7 }}>Read-only</span>
        </div>
      </div>

      <div className="diagramCanvas">
        <div className="diagramViewport" ref={viewport.viewportRef} aria-label="Portal diagram viewer" style={{ height: '70vh', minHeight: 420 }}>
          <div style={{ width: surfaceWidthModel * viewport.zoom, height: surfaceHeightModel * viewport.zoom, position: 'relative' }}>
            <div
              className="diagramSurface"
              ref={viewport.surfaceRef}
              onPointerDownCapture={clearSelectionIfBackground}
              style={{
                width: surfaceWidthModel,
                height: surfaceHeightModel,
                transform: `scale(${viewport.zoom})`,
                transformOrigin: '0 0',
              }}
            >
              <DiagramNodesLayer
                model={model}
                activeView={view}
                notation={notation}
                nodes={nodes}
                selection={selection}
                linkDrag={null}
                clientToModelPoint={viewport.clientToModelPoint}
                onSelect={setSelection}
                onBeginNodeDrag={noop}
                onHoverAsRelationshipTarget={noopHoverTarget}
                onStartLinkDrag={noopStartLinkDrag}
                getElementBgVar={(t: string) => getElementBgVar(t as ElementType)}
              />

              <DiagramRelationshipsLayer
                model={model}
                notation={notation}
                viewId={viewId}
                gridSize={view?.formatting?.gridSize}
                nodes={nodes}
                connectionRenderItems={connectionRenderItems}
                surfaceWidthModel={surfaceWidthModel}
                surfaceHeightModel={surfaceHeightModel}
                selection={selection}
                linkDrag={null}
                groupBoxDraft={null}
                onSelect={setSelection}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

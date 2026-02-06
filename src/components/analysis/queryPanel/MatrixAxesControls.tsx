import type { ElementType } from '../../../domain';
import { getElementTypeLabel } from '../../../domain';

import type { MatrixAxisSource } from './useMatrixAxesLayerGuards';

export type MatrixAxesControlsProps = {
  selectionElementIds: string[];

  // Row controls
  hasLayerFacet: boolean;
  availableLayers: string[];
  matrixRowSource: MatrixAxisSource;
  onChangeMatrixRowSource: (v: MatrixAxisSource) => void;
  matrixRowElementType: ElementType | '';
  onChangeMatrixRowElementType: (v: ElementType | '') => void;
  matrixRowLayer: string | '';
  onChangeMatrixRowLayer: (v: string | '') => void;
  matrixRowSelectionIds: string[];
  onCaptureMatrixRowSelection: () => void;
  availableRowElementTypes: ElementType[];

  // Column controls
  matrixColSource: MatrixAxisSource;
  onChangeMatrixColSource: (v: MatrixAxisSource) => void;
  matrixColElementType: ElementType | '';
  onChangeMatrixColElementType: (v: ElementType | '') => void;
  matrixColLayer: string | '';
  onChangeMatrixColLayer: (v: string | '') => void;
  matrixColSelectionIds: string[];
  onCaptureMatrixColSelection: () => void;
  availableColElementTypes: ElementType[];

  onSwapMatrixAxes: () => void;
};

export function MatrixAxesControls({
  selectionElementIds,
  hasLayerFacet,
  availableLayers,
  matrixRowSource,
  onChangeMatrixRowSource,
  matrixRowElementType,
  onChangeMatrixRowElementType,
  matrixRowLayer,
  onChangeMatrixRowLayer,
  matrixRowSelectionIds,
  onCaptureMatrixRowSelection,
  availableRowElementTypes,
  matrixColSource,
  onChangeMatrixColSource,
  matrixColElementType,
  onChangeMatrixColElementType,
  matrixColLayer,
  onChangeMatrixColLayer,
  matrixColSelectionIds,
  onCaptureMatrixColSelection,
  availableColElementTypes,
  onSwapMatrixAxes
}: MatrixAxesControlsProps) {
  return (
    <div className="toolbar" aria-label="Matrix query toolbar">
      <div className="toolbarGroup" style={{ minWidth: 260 }}>
        <label>Rows</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            className="selectInput"
            value={matrixRowSource}
            onChange={(e) => onChangeMatrixRowSource(e.currentTarget.value as MatrixAxisSource)}
            title="How to pick row elements"
          >
            <option value="facet">By type/layer</option>
            <option value="selection">Current selection</option>
          </select>

          {matrixRowSource === 'facet' ? (
            <>
              {hasLayerFacet ? (
                <select
                  className="selectInput"
                  value={matrixRowLayer}
                  onChange={(e) => onChangeMatrixRowLayer(e.currentTarget.value)}
                  title="Optional layer constraint"
                >
                  <option value="">Any layer</option>
                  {availableLayers.map((l) => (
                    <option key={l} value={l}>
                      {String(l)}
                    </option>
                  ))}
                </select>
              ) : null}

              <select
                className="selectInput"
                value={matrixRowElementType}
                onChange={(e) => onChangeMatrixRowElementType(e.currentTarget.value as ElementType | '')}
                title="Row element type"
              >
                <option value="">Select type…</option>
                {availableRowElementTypes.map((t) => (
                  <option key={t} value={t}>
                    {getElementTypeLabel(t)}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <button
                type="button"
                className="miniLinkButton"
                onClick={onCaptureMatrixRowSelection}
                disabled={selectionElementIds.length === 0}
                title="Use currently selected element(s) as rows"
              >
                Use selection
              </button>
              <span className="crudHint" style={{ margin: 0 }}>
                {matrixRowSelectionIds.length ? `${matrixRowSelectionIds.length} selected` : 'No rows selected'}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="toolbarGroup" style={{ minWidth: 0 }}>
        <label style={{ visibility: 'hidden' }} aria-hidden="true">
          Swap
        </label>
        <button type="button" className="shellButton" onClick={onSwapMatrixAxes} title="Swap row and column selections">
          ⇄ Swap
        </button>
      </div>

      <div className="toolbarGroup" style={{ minWidth: 260 }}>
        <label>Columns</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            className="selectInput"
            value={matrixColSource}
            onChange={(e) => onChangeMatrixColSource(e.currentTarget.value as MatrixAxisSource)}
            title="How to pick column elements"
          >
            <option value="facet">By type/layer</option>
            <option value="selection">Current selection</option>
          </select>

          {matrixColSource === 'facet' ? (
            <>
              {hasLayerFacet ? (
                <select
                  className="selectInput"
                  value={matrixColLayer}
                  onChange={(e) => onChangeMatrixColLayer(e.currentTarget.value)}
                  title="Optional layer constraint"
                >
                  <option value="">Any layer</option>
                  {availableLayers.map((l) => (
                    <option key={l} value={l}>
                      {String(l)}
                    </option>
                  ))}
                </select>
              ) : null}

              <select
                className="selectInput"
                value={matrixColElementType}
                onChange={(e) => onChangeMatrixColElementType(e.currentTarget.value as ElementType | '')}
                title="Column element type"
              >
                <option value="">Select type…</option>
                {availableColElementTypes.map((t) => (
                  <option key={t} value={t}>
                    {getElementTypeLabel(t)}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <button
                type="button"
                className="miniLinkButton"
                onClick={onCaptureMatrixColSelection}
                disabled={selectionElementIds.length === 0}
                title="Use currently selected element(s) as columns"
              >
                Use selection
              </button>
              <span className="crudHint" style={{ margin: 0 }}>
                {matrixColSelectionIds.length ? `${matrixColSelectionIds.length} selected` : 'No columns selected'}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

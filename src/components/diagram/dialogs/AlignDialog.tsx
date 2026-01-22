import { Dialog } from '../../dialog/Dialog';

import type { AlignMode, DistributeMode, SameSizeMode } from '../../../domain/layout/types';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  selectedCount: number;
  onAlign: (mode: AlignMode) => void;
  onDistribute: (mode: DistributeMode) => void;
  onSameSize: (mode: SameSizeMode) => void;
};

export function AlignDialog({ isOpen, onClose, selectedCount, onAlign, onDistribute, onSameSize }: Props) {
  const alignDisabled = selectedCount < 2;
  const distributeDisabled = selectedCount < 3;

  return (
    <Dialog
      title="Arrange"
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <button type="button" className="shellButton" onClick={onClose}>
          Close
        </button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p className="hintText" style={{ margin: 0 }}>
          {selectedCount} node{selectedCount === 1 ? '' : 's'} selected. Choose an operation.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Horizontal</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="shellButton" disabled={alignDisabled} onClick={() => onAlign('left')}>
                Left
              </button>
              <button type="button" className="shellButton" disabled={alignDisabled} onClick={() => onAlign('center')}>
                Center
              </button>
              <button type="button" className="shellButton" disabled={alignDisabled} onClick={() => onAlign('right')}>
                Right
              </button>
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Vertical</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="shellButton" disabled={alignDisabled} onClick={() => onAlign('top')}>
                Top
              </button>
              <button type="button" className="shellButton" disabled={alignDisabled} onClick={() => onAlign('middle')}>
                Middle
              </button>
              <button type="button" className="shellButton" disabled={alignDisabled} onClick={() => onAlign('bottom')}>
                Bottom
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Same size</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="shellButton" disabled={alignDisabled} onClick={() => onSameSize('width')}>
                Same width
              </button>
              <button type="button" className="shellButton" disabled={alignDisabled} onClick={() => onSameSize('height')}>
                Same height
              </button>
              <button type="button" className="shellButton" disabled={alignDisabled} onClick={() => onSameSize('both')}>
                Same size
              </button>
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Distribute</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="shellButton"
                disabled={distributeDisabled}
                onClick={() => onDistribute('horizontal')}
              >
                Horizontal
              </button>
              <button
                type="button"
                className="shellButton"
                disabled={distributeDisabled}
                onClick={() => onDistribute('vertical')}
              >
                Vertical
              </button>
            </div>
          </div>
        </div>

        {selectedCount < 2 ? (
          <p className="hintText" style={{ margin: 0 }}>
            Select at least two nodes in the view to align or make the same size.
          </p>
        ) : null}

        {selectedCount >= 2 && selectedCount < 3 ? (
          <p className="hintText" style={{ margin: 0 }}>
            Distribute requires at least three nodes.
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

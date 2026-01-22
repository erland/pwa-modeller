import { Dialog } from '../../dialog/Dialog';

import type { AlignMode } from '../../../domain/layout/types';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  selectedCount: number;
  onAlign: (mode: AlignMode) => void;
};

export function AlignDialog({ isOpen, onClose, selectedCount, onAlign }: Props) {
  const disabled = selectedCount < 2;

  return (
    <Dialog
      title="Align"
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
          {selectedCount} node{selectedCount === 1 ? '' : 's'} selected. Choose an alignment operation.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Horizontal</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="shellButton" disabled={disabled} onClick={() => onAlign('left')}>
                Left
              </button>
              <button type="button" className="shellButton" disabled={disabled} onClick={() => onAlign('center')}>
                Center
              </button>
              <button type="button" className="shellButton" disabled={disabled} onClick={() => onAlign('right')}>
                Right
              </button>
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Vertical</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="shellButton" disabled={disabled} onClick={() => onAlign('top')}>
                Top
              </button>
              <button type="button" className="shellButton" disabled={disabled} onClick={() => onAlign('middle')}>
                Middle
              </button>
              <button type="button" className="shellButton" disabled={disabled} onClick={() => onAlign('bottom')}>
                Bottom
              </button>
            </div>
          </div>
        </div>

        {disabled ? (
          <p className="hintText" style={{ margin: 0 }}>
            Select at least two nodes in the view to align.
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

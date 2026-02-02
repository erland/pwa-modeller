import { Dialog } from '../dialog/Dialog';

import type { MiniGraphOptions } from './MiniGraphOptions';
import { MiniGraphOptionsToggles } from './MiniGraphOptions';

type Props = {
  isOpen: boolean;
  onClose: () => void;

  graphOptions: MiniGraphOptions;
  onChangeGraphOptions: (next: MiniGraphOptions) => void;

  /** Optional numeric property keys for overlay autocomplete. */
  availablePropertyKeys?: string[];
};

export function OverlaySettingsDialog({
  isOpen,
  onClose,
  graphOptions,
  onChangeGraphOptions,
  availablePropertyKeys,
}: Props) {
  return (
    <Dialog
      title="Overlay"
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <button type="button" className="shellButton" onClick={onClose}>
          Close
        </button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="crudHint" style={{ marginTop: 0 }}>
          Select a preset or choose an overlay metric. When enabled, nodes show a badge with the metric value.
        </div>

        <MiniGraphOptionsToggles
          options={graphOptions}
          onChange={onChangeGraphOptions}
          availablePropertyKeys={availablePropertyKeys}
          style={{ gap: 16, flexWrap: 'wrap' }}
          checkboxStyle={{ gap: 8 }}
        />
      </div>
    </Dialog>
  );
}

import { Dialog } from '../../dialog/Dialog';

import type { MiniGraphOptions } from '../MiniGraphOptions';
import { MiniGraphOptionsToggles } from '../MiniGraphOptions';

type Props = {
  isOpen: boolean;
  onClose: () => void;

  autoExpand: boolean;
  onChangeAutoExpand: (next: boolean) => void;

  graphOptions: MiniGraphOptions;
  onChangeGraphOptions: (next: MiniGraphOptions) => void;

  /** Optional numeric property keys for overlay autocomplete. */
  availablePropertyKeys?: string[];
};

export function TraceabilitySettingsDialog({
  isOpen,
  onClose,
  autoExpand,
  onChangeAutoExpand,
  graphOptions,
  onChangeGraphOptions,
  availablePropertyKeys
}: Props) {
  return (
    <Dialog
      title="Traceability settings"
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <button type="button" className="shellButton" onClick={onClose}>
          Close
        </button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div className="crudHint" style={{ marginTop: 0 }}>
            These options are rarely changed. Defaults are usually enough.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="crudTitle" style={{ fontSize: 13 }}>
            Behavior
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.9 }}>
            <input type="checkbox" checked={autoExpand} onChange={(e) => onChangeAutoExpand(e.currentTarget.checked)} />
            Auto-expand on select
          </label>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="crudTitle" style={{ fontSize: 13 }}>
            Display
          </div>
          <MiniGraphOptionsToggles
            options={graphOptions}
            onChange={onChangeGraphOptions}
            availablePropertyKeys={availablePropertyKeys}
            style={{ gap: 16 }}
            checkboxStyle={{ gap: 8 }}
          />
        </div>
      </div>
    </Dialog>
  );
}

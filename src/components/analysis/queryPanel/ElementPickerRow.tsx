import type { Element, Model } from '../../../domain';

import { labelForElement } from './utils';

type Props = {
  which: 'start' | 'source' | 'target';
  label: string;
  inputId: string;

  model: Model;
  valueId: string;

  canUseSelection: boolean;
  onUseSelection: (which: 'start' | 'source' | 'target') => void;

  onOpenChooser: (which: 'start' | 'source' | 'target') => void;
  onClear: () => void;
};

function elementLabel(model: Model, id: string): string {
  if (!id) return '';
  const el = model.elements[id] as Element | undefined;
  return el ? labelForElement(el) : '';
}

export function ElementPickerRow({
  which,
  label,
  inputId,
  model,
  valueId,
  canUseSelection,
  onUseSelection,
  onOpenChooser,
  onClear
}: Props) {
  return (
    <div className="toolbarGroup">
      <label htmlFor={inputId}>{label}</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          id={inputId}
          className="textInput"
          readOnly
          value={elementLabel(model, valueId)}
          placeholder="Select…"
        />
        <button type="button" className="shellButton secondary" onClick={() => onOpenChooser(which)}>
          Choose…
        </button>
        <button type="button" className="shellButton secondary" disabled={!valueId} onClick={onClear}>
          Clear
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <button
          type="button"
          className="miniLinkButton"
          disabled={!canUseSelection}
          onClick={() => onUseSelection(which)}
        >
          Use current selection
        </button>
      </div>
    </div>
  );
}

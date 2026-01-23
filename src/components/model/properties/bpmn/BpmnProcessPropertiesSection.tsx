import type { Element, Model } from '../../../../domain';

import type { Selection } from '../../selection';
import type { ModelActions } from '../actions';
import { PropertyRow } from '../editors/PropertyRow';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

type Props = {
  model: Model;
  element: Element;
  actions: ModelActions;
  onSelect?: (selection: Selection) => void;
};

/** Lightweight Process container properties (attrs.isExecutable). */
export function BpmnProcessPropertiesSection({ model, element: el, actions, onSelect }: Props) {
  void onSelect;
  void model;
  if (String(el.type) !== 'bpmn.process') return null;

  const attrs = isRecord(el.attrs) ? (el.attrs as Record<string, unknown>) : {};
  const isExecutable = typeof attrs.isExecutable === 'boolean' ? attrs.isExecutable : false;

  return (
    <>
      <p className="panelHint">BPMN</p>
      <div className="propertiesGrid">
        <PropertyRow label="Executable">
          <input
            type="checkbox"
            aria-label="BPMN process is executable"
            checked={isExecutable}
            onChange={(e) => actions.setBpmnElementAttrs(el.id, { isExecutable: e.target.checked ? true : undefined })}
          />
        </PropertyRow>
      </div>
    </>
  );
}

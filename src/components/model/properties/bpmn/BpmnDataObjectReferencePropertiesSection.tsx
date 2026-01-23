import type { Element, Model } from '../../../../domain';

import type { Selection } from '../../selection';
import type { ModelActions } from '../actions';
import { PropertyRow } from '../editors/PropertyRow';
import { bpmnElementOptionLabel } from './bpmnOptionLabel';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

type Props = {
  model: Model;
  element: Element;
  actions: ModelActions;
  onSelect?: (selection: Selection) => void;
};

/** DataObjectReference properties (attrs.dataObjectRef). */
export function BpmnDataObjectReferencePropertiesSection({ model, element: el, actions, onSelect }: Props) {
  if (String(el.type) !== 'bpmn.dataObjectReference') return null;

  const attrs = isRecord(el.attrs) ? (el.attrs as Record<string, unknown>) : {};
  const dataObjectRef = typeof attrs.dataObjectRef === 'string' ? attrs.dataObjectRef : '';

  const options = Object.values(model.elements)
    .filter(Boolean)
    .filter((e) => String(e.type) === 'bpmn.dataObject')
    .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, undefined, { sensitivity: 'base' }));

  const selectedName = dataObjectRef ? model.elements[dataObjectRef]?.name ?? dataObjectRef : undefined;

  return (
    <>
      <p className="panelHint">BPMN</p>
      <div className="propertiesGrid">
        <PropertyRow label="Data object">
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select
              className="selectInput"
              aria-label="BPMN data object reference"
              value={dataObjectRef || ''}
              onChange={(e) => actions.setBpmnDataObjectReferenceRef(el.id, e.target.value ? e.target.value : null)}
              style={{ flex: 1, minWidth: 0 }}
            >
              <option value="">(none)</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {bpmnElementOptionLabel(o)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="miniButton"
              aria-label="Go to referenced data object"
              disabled={!dataObjectRef || !model.elements[dataObjectRef]}
              onClick={() =>
                dataObjectRef && model.elements[dataObjectRef] && onSelect?.({ kind: 'element', elementId: dataObjectRef })
              }
            >
              Go
            </button>
          </div>
        </PropertyRow>

        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
          dataObjectRef{selectedName ? <> → <b>{selectedName}</b></> : ' is not set.'}
        </div>
      </div>
    </>
  );
}

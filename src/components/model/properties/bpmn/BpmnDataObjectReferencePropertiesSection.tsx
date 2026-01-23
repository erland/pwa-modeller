import type { Element, Model } from '../../../../domain';

import type { ModelActions } from '../actions';
import { PropertyRow } from '../editors/PropertyRow';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

type Props = {
  model: Model;
  element: Element;
  actions: ModelActions;
};

/** DataObjectReference properties (attrs.dataObjectRef). */
export function BpmnDataObjectReferencePropertiesSection({ model, element: el, actions }: Props) {
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
          <select
            className="selectInput"
            aria-label="BPMN data object reference"
            value={dataObjectRef || ''}
            onChange={(e) => actions.setBpmnDataObjectReferenceRef(el.id, e.target.value ? e.target.value : null)}
          >
            <option value="">(none)</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name || o.id}
              </option>
            ))}
          </select>
        </PropertyRow>

        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
          dataObjectRef{selectedName ? <> → <b>{selectedName}</b></> : ' is not set.'}
        </div>
      </div>
    </>
  );
}

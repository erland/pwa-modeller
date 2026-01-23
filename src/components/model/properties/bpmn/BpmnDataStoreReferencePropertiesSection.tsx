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

/** DataStoreReference properties (attrs.dataStoreRef). */
export function BpmnDataStoreReferencePropertiesSection({ model, element: el, actions }: Props) {
  if (String(el.type) !== 'bpmn.dataStoreReference') return null;

  const attrs = isRecord(el.attrs) ? (el.attrs as Record<string, unknown>) : {};
  const dataStoreRef = typeof attrs.dataStoreRef === 'string' ? attrs.dataStoreRef : '';

  const options = Object.values(model.elements)
    .filter(Boolean)
    .filter((e) => String(e.type) === 'bpmn.dataStore')
    .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, undefined, { sensitivity: 'base' }));

  const selectedName = dataStoreRef ? model.elements[dataStoreRef]?.name ?? dataStoreRef : undefined;

  return (
    <>
      <p className="panelHint">BPMN</p>
      <div className="propertiesGrid">
        <PropertyRow label="Data store">
          <select
            className="selectInput"
            aria-label="BPMN data store reference"
            value={dataStoreRef || ''}
            onChange={(e) => actions.setBpmnDataStoreReferenceRef(el.id, e.target.value ? e.target.value : null)}
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
          dataStoreRef{selectedName ? <> → <b>{selectedName}</b></> : ' is not set.'}
        </div>
      </div>
    </>
  );
}
